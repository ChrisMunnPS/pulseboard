import { PASSWORD_MIN, ROLES, type AlertRule, type AuditRow, type Channel, type RuleKey, type UserRow } from '@pulse/shared';
import bcrypt from 'bcryptjs';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { audit, guard } from './auth';
import { pool } from './db';
import { RULE_META, loadRules } from './engine';
import { parseTargetUrl } from './netsafe';
import { send, type ChannelRow } from './notify';
import { lockedFor, recordFail, recordOk } from './ratelimit';
import { vault } from './vault-instance';

const Sev = z.enum(['info', 'warning', 'critical']);
const Password = z.string().min(PASSWORD_MIN, `Use at least ${PASSWORD_MIN} characters.`).max(128);
const RANGE: Record<RuleKey, [number, number]> = { cpu: [1, 100], memory: [1, 100], disk: [1, 100], offline: [0, 0], service: [1, 1000], temperature: [1, 200], smart: [1, 1000] };

const toChannel = (r: ChannelRow): Channel => {
  let hint: string | null = null;
  if (r.secret_enc) {
    hint = r.type === 'email' ? 'password set' : (() => { try { return new URL(vault.open(r.secret_enc!)).host; } catch { return 'set'; } })();
  }
  return { id: r.id, type: r.type, name: r.name, enabled: r.enabled, minSeverity: r.min_severity, config: r.config as Channel['config'], secretHint: hint };
};

const ChannelBody = z.object({
  type: z.enum(['email', 'teams', 'slack', 'discord', 'webhook']),
  name: z.string().trim().min(1).max(60),
  enabled: z.boolean().default(true),
  minSeverity: Sev.default('warning'),
  config: z.record(z.string(), z.unknown()).default({}),
  secret: z.string().max(2000).optional(),
});
const EmailConfig = z.object({
  host: z.string().trim().min(1).max(255).regex(/^[A-Za-z0-9.-]+$/, 'Enter a hostname or IP address.'),
  port: z.coerce.number().int().min(1).max(65535),
  secure: z.boolean().default(false),
  user: z.string().trim().max(255).default(''),
  from: z.string().email(),
  to: z.string().trim().min(3).max(500).refine((v) => v.split(',').length <= 10 && v.split(',').every((a) => z.string().email().safeParse(a.trim()).success), 'Enter up to 10 valid email addresses, separated by commas.'),
});

/** Validates a channel and returns what to store. `secret` undefined = keep the existing one. */
function validateChannel(b: z.infer<typeof ChannelBody>, haveSecret: boolean): { config: object; secret?: string } {
  if (b.type === 'email') {
    const config = EmailConfig.parse(b.config);
    return { config, secret: b.secret ? vault.seal(b.secret) : undefined };
  }
  if (!b.secret && haveSecret) return { config: {} };
  parseTargetUrl(b.secret ?? '', b.type !== 'webhook');
  return { config: {}, secret: vault.seal(b.secret!) };
}

const clean = (e: unknown): string => (e instanceof z.ZodError ? e.issues[0]?.message ?? 'Invalid input' : (e as Error).message).slice(0, 200);
const csvCell = (v: unknown): string => {
  let s = v === null || v === undefined ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // stops spreadsheets from running cell contents as formulas
  return `"${s.replace(/"/g, '""')}"`;
};

export async function registerAdminRoutes(app: FastifyInstance): Promise<void> {
  // ---------- alert rules ----------
  app.get('/api/v1/rules', { preHandler: guard('settings:manage') }, async (): Promise<AlertRule[]> => loadRules());

  app.put<{ Params: { key: string } }>('/api/v1/rules/:key', { preHandler: guard('settings:manage') }, async (req, reply) => {
    const key = req.params.key as RuleKey;
    if (!RULE_META[key]) return reply.code(404).send({ error: 'Unknown rule' });
    const [lo, hi] = RANGE[key];
    const body = z.object({ threshold: z.number().min(lo).max(hi), durationS: z.number().int().min(0).max(86400), severity: Sev, enabled: z.boolean() }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: clean(body.error) });
    await pool.query('update alert_rules set threshold=$2, duration_s=$3, severity=$4, enabled=$5, updated_at=now() where key=$1', [key, body.data.threshold, body.data.durationS, body.data.severity, body.data.enabled]);
    await audit(req.user.sub, 'rule.update', key, 'ok', body.data);
    return loadRules();
  });

  // ---------- notification channels ----------
  app.get('/api/v1/channels', { preHandler: guard('settings:manage') }, async (): Promise<Channel[]> =>
    (await pool.query<ChannelRow>('select * from notification_channels order by created_at')).rows.map(toChannel));

  app.post('/api/v1/channels', { preHandler: guard('settings:manage') }, async (req, reply) => {
    try {
      const b = ChannelBody.parse(req.body);
      const v = validateChannel(b, false);
      const { rows } = await pool.query<ChannelRow>(
        'insert into notification_channels (type,name,enabled,min_severity,config,secret_enc) values ($1,$2,$3,$4,$5,$6) returning *',
        [b.type, b.name, b.enabled, b.minSeverity, JSON.stringify(v.config), v.secret ?? null]);
      await audit(req.user.sub, 'channel.add', `${b.type}:${b.name}`);
      return reply.code(201).send(toChannel(rows[0]));
    } catch (e) { return reply.code(400).send({ error: clean(e) }); }
  });

  app.put<{ Params: { id: string } }>('/api/v1/channels/:id', { preHandler: guard('settings:manage') }, async (req, reply) => {
    try {
      const cur = (await pool.query<ChannelRow>('select * from notification_channels where id = $1', [req.params.id])).rows[0];
      if (!cur) return reply.code(404).send({ error: 'Channel not found' });
      const b = ChannelBody.parse({ ...(req.body as object), type: cur.type });
      const v = validateChannel(b, !!cur.secret_enc);
      const config = b.type === 'email' ? v.config : cur.config;
      const { rows } = await pool.query<ChannelRow>(
        'update notification_channels set name=$2, enabled=$3, min_severity=$4, config=$5, secret_enc=coalesce($6, secret_enc) where id=$1 returning *',
        [cur.id, b.name, b.enabled, b.minSeverity, JSON.stringify(config), v.secret ?? null]);
      await audit(req.user.sub, 'channel.update', `${b.type}:${b.name}`, 'ok', { secretChanged: !!v.secret });
      return toChannel(rows[0]);
    } catch (e) { return reply.code(400).send({ error: clean(e) }); }
  });

  app.delete<{ Params: { id: string } }>('/api/v1/channels/:id', { preHandler: guard('settings:manage') }, async (req, reply) => {
    const { rows } = await pool.query('delete from notification_channels where id = $1 returning type, name', [req.params.id]);
    if (!rows[0]) return reply.code(404).send({ error: 'Channel not found' });
    await audit(req.user.sub, 'channel.delete', `${rows[0].type}:${rows[0].name}`);
    return { ok: true };
  });

  app.post<{ Params: { id: string } }>('/api/v1/channels/:id/test', { preHandler: guard('settings:manage') }, async (req, reply) => {
    const ch = (await pool.query<ChannelRow>('select * from notification_channels where id = $1', [req.params.id])).rows[0];
    if (!ch) return reply.code(404).send({ error: 'Channel not found' });
    try {
      await send(ch, { severity: 'info', title: 'Test notification', detail: 'This is a test from Pulseboard.', device: 'Pulseboard', at: new Date().toISOString() });
      await audit(req.user.sub, 'channel.test', `${ch.type}:${ch.name}`);
      return { ok: true };
    } catch (e) {
      await audit(req.user.sub, 'channel.test', `${ch.type}:${ch.name}`, 'failed');
      return reply.code(502).send({ error: `Test failed: ${clean(e)}` });
    }
  });

  // ---------- users (owner only) ----------
  app.get('/api/v1/users', { preHandler: guard('users:manage') }, async (): Promise<UserRow[]> =>
    (await pool.query('select id, email, role, disabled, created_at from users order by email')).rows.map((r) => ({ id: r.id, email: r.email, role: r.role, disabled: r.disabled, createdAt: r.created_at.toISOString() })));

  app.post('/api/v1/users', { preHandler: guard('users:manage') }, async (req, reply) => {
    const b = z.object({ email: z.string().email().max(255), role: z.enum(ROLES), password: Password }).safeParse(req.body);
    if (!b.success) return reply.code(400).send({ error: clean(b.error) });
    const tenant = (await pool.query('select tenant_id from users where id = $1', [req.user.sub])).rows[0]?.tenant_id ?? null;
    try {
      const { rows } = await pool.query('insert into users (tenant_id,email,password_hash,role) values ($1,$2,$3,$4) returning id', [tenant, b.data.email.toLowerCase(), await bcrypt.hash(b.data.password, 12), b.data.role]);
      await audit(req.user.sub, 'user.add', b.data.email.toLowerCase(), 'ok', { role: b.data.role });
      return reply.code(201).send({ id: rows[0].id });
    } catch (e) {
      if ((e as { code?: string }).code === '23505') return reply.code(409).send({ error: 'A user with that email already exists.' });
      throw e;
    }
  });

  app.patch<{ Params: { id: string } }>('/api/v1/users/:id', { preHandler: guard('users:manage') }, async (req, reply) => {
    const b = z.object({ role: z.enum(ROLES).optional(), disabled: z.boolean().optional(), password: Password.optional() }).safeParse(req.body);
    if (!b.success) return reply.code(400).send({ error: clean(b.error) });
    const target = (await pool.query('select id, email, role, disabled from users where id = $1', [req.params.id])).rows[0];
    if (!target) return reply.code(404).send({ error: 'User not found' });
    const newRole = b.data.role ?? target.role;
    const newDisabled = b.data.disabled ?? target.disabled;
    const staysActiveOwner = newRole === 'owner' && !newDisabled;
    if (target.role === 'owner' && !target.disabled && !staysActiveOwner) {
      const others = (await pool.query("select count(*)::int as n from users where role = 'owner' and not disabled and id <> $1", [target.id])).rows[0].n;
      if (others === 0) return reply.code(400).send({ error: 'There must always be at least one active owner.' });
    }
    await pool.query(
      `update users set role = $2, disabled = $3,
         password_hash = coalesce($4, password_hash), pw_changed_at = case when $4::text is null then pw_changed_at else now() end
       where id = $1`,
      [target.id, newRole, newDisabled, b.data.password ? await bcrypt.hash(b.data.password, 12) : null]);
    await audit(req.user.sub, 'user.update', target.email, 'ok', { role: newRole, disabled: newDisabled, passwordReset: !!b.data.password });
    return { ok: true };
  });

  // ---------- own password (any signed-in user) ----------
  app.post('/api/v1/auth/change-password', { preHandler: guard('devices:read') }, async (req, reply) => {
    const b = z.object({ current: z.string().min(1).max(128), next: Password }).safeParse(req.body);
    if (!b.success) return reply.code(400).send({ error: clean(b.error) });
    const key = `pw:${req.user.sub}`;
    const wait = lockedFor([key]);
    if (wait) return reply.code(429).send({ error: `Too many attempts. Try again in ${Math.ceil(wait / 60)} minutes.` });
    const u = (await pool.query('select password_hash from users where id = $1', [req.user.sub])).rows[0];
    if (!(await bcrypt.compare(b.data.current, u.password_hash))) {
      recordFail(key, 5);
      await audit(req.user.sub, 'password.change', 'self', 'denied');
      return reply.code(400).send({ error: 'Your current password is not correct.' });
    }
    recordOk(key);
    await pool.query('update users set password_hash = $2, pw_changed_at = now() where id = $1', [req.user.sub, await bcrypt.hash(b.data.next, 12)]);
    await audit(req.user.sub, 'password.change', 'self');
    // All older sessions stop working; this fresh token keeps the current one signed in.
    return { token: app.jwt.sign({ sub: req.user.sub, role: req.user.role }, { expiresIn: '8h' }) };
  });

  // ---------- audit log ----------
  const auditQuery = z.object({ q: z.string().max(100).optional(), result: z.string().max(20).optional(), limit: z.coerce.number().int().min(1).max(500).default(100), offset: z.coerce.number().int().min(0).default(0) });
  const find = async (q: z.infer<typeof auditQuery>, limit: number) => (await pool.query(
    `select a.id, a.at, u.email as actor, a.action, a.target, a.result from audit_log a left join users u on u.id = a.actor_id
     where ($1::text is null or a.action ilike $1 or a.target ilike $1 or u.email ilike $1) and ($2::text is null or a.result = $2)
     order by a.at desc, a.id desc limit $3 offset $4`,
    [q.q ? `%${q.q.replace(/[\\%_]/g, '\\$&')}%` : null, q.result || null, limit, q.offset],
  )).rows as { id: string; at: Date; actor: string | null; action: string; target: string | null; result: string }[];

  app.get('/api/v1/audit', { preHandler: guard('audit:read') }, async (req) => {
    const q = auditQuery.parse(req.query);
    const rows = await find(q, q.limit + 1);
    const out: AuditRow[] = rows.slice(0, q.limit).map((r) => ({ id: Number(r.id), at: r.at.toISOString(), actor: r.actor, action: r.action, target: r.target, result: r.result }));
    return { rows: out, hasMore: rows.length > q.limit };
  });

  app.get('/api/v1/audit.csv', { preHandler: guard('audit:read') }, async (req, reply) => {
    const q = auditQuery.parse({ ...(req.query as object), offset: 0 });
    const rows = await find(q, 5000);
    await audit(req.user.sub, 'audit.export', 'csv', 'ok', { rows: rows.length });
    const lines = [['id', 'time', 'actor', 'action', 'target', 'result'].join(',')];
    for (const r of rows) lines.push([r.id, r.at.toISOString(), r.actor, r.action, r.target, r.result].map(csvCell).join(','));
    return reply.header('content-type', 'text/csv; charset=utf-8').header('content-disposition', 'attachment; filename="pulseboard-audit.csv"').send(lines.join('\r\n'));
  });
}
