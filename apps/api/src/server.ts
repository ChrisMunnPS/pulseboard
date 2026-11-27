import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import websocket from '@fastify/websocket';
import { LoginBody, type Alert, type FleetTick, type Role } from '@pulse/shared';
import bcrypt from 'bcryptjs';
import Fastify from 'fastify';
import { registerAdminRoutes } from './admin';
import { audit, guard } from './auth';
import { config } from './config';
import { migrate, pool, waitForDb } from './db';
import { registerDeviceRoutes } from './devices';
import { forgetStatus, purge, trackStatus } from './history';
import { registerInsightRoutes } from './insights';
import { evaluate, startEngine } from './engine';
import { getFleet, loadFleet } from './fleet';
import { step } from './mock';
import { startPoller } from './poller';
import { lockedFor, recordFail, recordOk } from './ratelimit';
import { issueTicket, redeemTicket } from './tickets';
import { VERSION } from './version';
import { deviceView } from './views';

// Request logs never include the query string, so tokens or tickets cannot leak into them.
const app = Fastify({
  trustProxy: config.TRUST_PROXY === 'true',
  logger: {
    serializers: {
      req: (req) => ({ method: req.method, url: req.url?.split('?')[0], host: req.host, remoteAddress: req.ip }),
    },
  },
});
await app.register(cors, { origin: config.CORS_ORIGIN === '*' ? true : config.CORS_ORIGIN.split(',') });
await app.register(jwt, { secret: config.JWT_SECRET });
await app.register(websocket);

// ---------- startup: database, migrations, first admin, optional demo data ----------
await waitForDb();
await migrate();

async function seed() {
  const { rows } = await pool.query('select count(*)::int as n from users');
  if (rows[0].n > 0) return;
  const tenant = (await pool.query("insert into tenants (name) values ('Default') returning id")).rows[0].id;
  await pool.query('insert into users (tenant_id, email, password_hash, role) values ($1,$2,$3,$4)', [
    tenant, config.ADMIN_EMAIL.toLowerCase(), await bcrypt.hash(config.ADMIN_PASSWORD, 12), 'owner',
  ]);
  app.log.info(`Created admin user ${config.ADMIN_EMAIL}`);
  if (config.SEED_DEMO !== 'true') return;
  const demo: [string, string, string, boolean][] = [
    ['web-prod-01', 'Ubuntu 24.04', '10.0.1.11', false], ['web-prod-02', 'Ubuntu 24.04', '10.0.1.12', false],
    ['db-prod-01', 'Windows Server 2022', '10.0.2.21', false], ['db-prod-02', 'Windows Server 2022', '10.0.2.22', false],
    ['file-srv-01', 'Windows Server 2019', '10.0.3.5', false], ['k8s-node-03', 'Debian 12', '10.0.4.33', false],
    ['nas-homelab', 'TrueNAS', '192.168.1.20', true], ['dc-01', 'Windows Server 2025', '10.0.0.10', false],
  ];
  const ids: Record<string, string> = {};
  for (const [name, os, address, offline] of demo) {
    ids[name] = (await pool.query('insert into devices (tenant_id,name,os,address,offline) values ($1,$2,$3,$4,$5) returning id', [tenant, name, os, address, offline])).rows[0].id;
  }
  const alerts: [string, string, string, string][] = [
    ['db-prod-02', 'critical', 'Low disk space', 'C: is almost full'],
    ['nas-homelab', 'critical', 'Device offline', 'No check-in for 12 minutes'],
    ['db-prod-01', 'warning', 'High CPU', 'CPU above 75% for 10 minutes'],
    ['web-prod-02', 'info', 'Service restarted', 'nginx restarted'],
  ];
  for (const [d, sev, title, detail] of alerts) {
    await pool.query('insert into alerts (device_id,severity,title,detail) values ($1,$2,$3,$4)', [ids[d], sev, title, detail]);
  }
}
await seed();
await loadFleet();
await startEngine((m) => app.log.warn(m));
startPoller(getFleet, (m) => app.log.warn(m));

const tick = (): FleetTick => ({
  type: 'tick',
  at: new Date().toISOString(),
  devices: getFleet().map(deviceView).map(({ id, status, health, cpu, memory, disk, latencyMs }) => ({ id, status, health, cpu, memory, disk, latencyMs })),
});

// ---------- routes ----------
app.get('/health', async () => {
  await pool.query('select 1');
  return { status: 'ok', version: VERSION };
});

const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 12); // compared when the user is unknown, so timing does not reveal valid emails

app.post('/api/v1/auth/login', async (req, reply) => {
  const body = LoginBody.safeParse(req.body);
  if (!body.success) return reply.code(400).send({ error: 'Enter your email and password' });
  const email = body.data.email.toLowerCase();
  const keyUser = `u:${req.ip}|${email}`, keyIp = `i:${req.ip}`;
  const wait = lockedFor([keyUser, keyIp]);
  if (wait) return reply.code(429).header('retry-after', String(wait)).send({ error: `Too many sign-in attempts. Try again in ${Math.ceil(wait / 60)} minutes.` });
  const { rows } = await pool.query('select id, password_hash, role, disabled from users where email = $1', [email]);
  const user = rows[0];
  const ok = await bcrypt.compare(body.data.password, user?.password_hash ?? DUMMY_HASH);
  if (!user || user.disabled || !ok) {
    recordFail(keyUser, 5);
    recordFail(keyIp, 30);
    await audit(null, 'login', email, 'denied');
    return reply.code(401).send({ error: 'Email or password is incorrect' });
  }
  recordOk(keyUser);
  await audit(user.id, 'login', email);
  return { token: app.jwt.sign({ sub: user.id, role: user.role as Role }, { expiresIn: '8h' }), role: user.role };
});

app.get('/api/v1/alerts', { preHandler: guard('devices:read') }, async (): Promise<Alert[]> => {
  const { rows } = await pool.query(
    `select a.*, d.name as device_name from alerts a left join devices d on d.id = a.device_id
     where a.state <> 'resolved' order by a.opened_at desc`,
  );
  return rows.map((r) => ({
    id: r.id, severity: r.severity, title: r.title, detail: r.detail, deviceId: r.device_id,
    deviceName: r.device_name, state: r.state, openedAt: r.opened_at.toISOString(),
  }));
});
app.post<{ Params: { id: string } }>('/api/v1/alerts/:id/ack', { preHandler: guard('alerts:ack') }, async (req, reply) => {
  const res = await pool.query("update alerts set state = 'acked', acked_by = $2 where id = $1 and state = 'open'", [req.params.id, req.user.sub]);
  if (!res.rowCount) return reply.code(404).send({ error: 'Alert not found or already acknowledged' });
  await audit(req.user.sub, 'alert.ack', req.params.id);
  return { ok: true };
});

// The browser trades its sign-in token for a one-time ticket, then opens the WebSocket with the ticket.
app.post('/api/v1/ws-ticket', { preHandler: guard('devices:read') }, async (req) => ({ ticket: issueTicket(req.user) }));

await registerAdminRoutes(app);
await registerDeviceRoutes(app);
await registerInsightRoutes(app);

app.get('/ws/fleet', { websocket: true }, (socket, req) => {
  if (!redeemTicket((req.query as { ticket?: string }).ticket ?? '')) {
    socket.close(1008, 'Sign in required');
    return;
  }
  socket.send(JSON.stringify(tick()));
});

setInterval(() => {
  step();
  trackStatus(getFleet().map(deviceView)).catch((e: Error) => app.log.error(`Status log failed: ${e.message}`));
  evaluate(getFleet()).catch((e: Error) => app.log.error(`Rule check failed: ${e.message}`));
  const msg = JSON.stringify(tick());
  for (const client of app.websocketServer.clients) if (client.readyState === 1) client.send(msg);
}, 5000);

// Old readings are deleted once a day (RETENTION_DAYS)
const runPurge = () => purge(config.RETENTION_DAYS).catch((e: Error) => app.log.error(`Purge failed: ${e.message}`));
void runPurge();
setInterval(runPurge, 24 * 3_600_000);

app.log.info(`Pulseboard ${VERSION}`);
await app.listen({ port: config.PORT, host: '0.0.0.0' });
