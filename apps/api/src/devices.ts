import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DeviceInput } from '@pulse/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { audit, guard } from './auth';
import { pool } from './db';
import { findDevice, getFleet, loadFleet } from './fleet';
import { forgetStatus } from './history';
import { resetLive } from './live';
import { processes, services } from './mock';
import { checkMonitorAddress } from './netsafe';
import { poll } from './poller';
import { runPing, tcpCheck } from './ping';
import { lockedFor, recordFail } from './ratelimit';
import { friendlySnmpError, identify, type SnmpCfg } from './snmp';
import { Metrics } from './collector-schema';
import { parseDoc, sshTargetOf } from './ssh-collect';
import { authorizedLine, newKey, peekKey, publicLineOf, takeKey } from './sshkeys';
import { runCollector } from './ssh-run';
import type { DeviceRow } from './types';
import { vault } from './vault-instance';
import { deviceDetail, deviceView } from './views';

interface Built { config: Record<string, unknown>; secret: Record<string, string> | null; mode: string }
const MIN_KEY = 8;
const clean = (e: unknown): string => (e instanceof z.ZodError ? e.issues[0]?.message ?? 'Invalid input' : (e as Error).message).slice(0, 220);

/** Turns the form into stored settings plus a secret. On edit, a blank secret keeps the saved one. */
/** `save` makes the host-key confirmation mandatory. The pending key is only looked at here; callers use it up after a successful save. */
function buildMonitor(i: DeviceInput, existing: DeviceRow | null, owner: string, save = false): Built {
  const bad = checkMonitorAddress(i.address);
  if (bad) throw new Error(bad);
  if (i.monitor === 'ping') return { config: {}, secret: null, mode: 'ping' };
  if (i.monitor === 'tcp') return { config: { port: i.port ?? 443 }, secret: null, mode: 'tcp' };
  if (i.monitor === 'ssh') {
    const s = i.ssh;
    if (!s) throw new Error('Enter the SSH settings.');
    const prev = existing?.monitor_secret_enc ? (JSON.parse(vault.open(existing.monitor_secret_enc)) as Record<string, string>) : {};
    let privateKey = existing?.monitor === 'ssh' ? prev.privateKey : undefined;
    if (s.keyId) {
      privateKey = peekKey(s.keyId, owner) ?? undefined;
      if (!privateKey) throw new Error('That key has expired. Generate a new one.');
    }
    if (!privateKey) throw new Error('Generate a key and add its public half to the device first.');
    const kept = existing?.monitor === 'ssh' && s.username === (existing.monitor_config as { username?: string }).username && !s.keyId ? (existing.monitor_config as { hostKey?: string }).hostKey : undefined;
    const hostKey = s.hostKey ?? kept;
    if (save && !hostKey) throw new Error('Run Test connection and confirm the host key fingerprint before saving.');
    return { config: { port: s.port, username: s.username, ...(hostKey ? { hostKey } : {}) }, secret: { privateKey }, mode: 'ssh' };
  }
  const s = i.snmp;
  if (!s) throw new Error('Enter the SNMP settings.');
  const old = existing?.monitor_secret_enc ? (JSON.parse(vault.open(existing.monitor_secret_enc)) as Record<string, string>) : {};
  if (s.version === 'v2c') {
    const community = s.community || old.community;
    if (!community) throw new Error('Enter the SNMP community string.');
    return { config: { version: 'v2c', port: s.port }, secret: { community }, mode: 'snmp-v2c' };
  }
  if (!s.username) throw new Error('Enter the SNMPv3 username.');
  const level = s.securityLevel ?? 'authPriv';
  const config: Record<string, unknown> = { version: 'v3', port: s.port, username: s.username, securityLevel: level };
  const secret: Record<string, string> = {};
  if (level !== 'noAuthNoPriv') {
    const authKey = s.authKey || old.authKey;
    if (!authKey || authKey.length < MIN_KEY) throw new Error(`The authentication key must be at least ${MIN_KEY} characters.`);
    config.authProtocol = s.authProtocol ?? 'sha256'; secret.authKey = authKey;
  }
  if (level === 'authPriv') {
    const privKey = s.privKey || old.privKey;
    if (!privKey || privKey.length < MIN_KEY) throw new Error(`The privacy key must be at least ${MIN_KEY} characters.`);
    config.privProtocol = s.privProtocol ?? 'aes'; secret.privKey = privKey;
  }
  return { config, secret, mode: 'snmp-v3' };
}

const snmpCfgOf = (b: Built): SnmpCfg => ({ ...(b.config as object), ...(b.secret ?? {}) } as unknown as SnmpCfg);

async function probe(i: DeviceInput, existing: DeviceRow | null, owner: string): Promise<{ message: string; hostKey?: string }> {
  const b = buildMonitor(i, existing, owner);
  if (i.monitor === 'ssh') {
    const t = { ...sshTargetOf({ address: i.address, monitor_config: b.config, monitor_secret_enc: vault.seal(JSON.stringify(b.secret)) }), pinned: i.ssh?.hostKey ?? null };
    const out = await runCollector(t, 'metrics');
    const m = parseDoc(Metrics, out.stdout);
    return { message: `SSH works: ${m.hostname ?? i.address}${m.os ? ` (${m.os})` : ''}`, hostKey: out.hostKey };
  }
  if (i.monitor === 'ping') {
    const r = await runPing(i.address);
    if (r.lossPct >= 100) throw new Error('No reply to ping. The device may be off, unreachable, or set to ignore ping.');
    return { message: `Reply in ${r.latencyMs} ms, ${r.lossPct}% packet loss.` };
  }
  if (i.monitor === 'tcp') return { message: `Port ${i.port ?? 443} answered in ${await tcpCheck(i.address, i.port ?? 443)} ms.` };
  const id = await identify(i.address, snmpCfgOf(b)).catch((e) => { throw new Error(friendlySnmpError(e)); });
  return { message: `SNMP ${i.snmp?.version} works (${id.rttMs} ms): ${(id.sysName || id.sysDescr).slice(0, 90)}` };
}

const SIM_ONLY = 'This device is monitored remotely, so this action is not available yet.';
const ACTIONS = new Set(['reboot', 'shutdown', 'wake']);
const SERVICE_ACTIONS: Record<string, 'Running' | 'Stopped'> = { start: 'Running', stop: 'Stopped', restart: 'Running' };

export async function registerDeviceRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/v1/devices', { preHandler: guard('devices:read') }, async () => getFleet().map(deviceView));

  app.get<{ Params: { id: string } }>('/api/v1/devices/:id', { preHandler: guard('devices:read') }, async (req, reply) => {
    const row = findDevice(req.params.id);
    return row ? deviceDetail(row) : reply.code(404).send({ error: 'Device not found' });
  });

  app.post('/api/v1/devices', { preHandler: guard('device:manage') }, async (req, reply) => {
    try {
      const i = DeviceInput.parse(req.body);
      const b = buildMonitor(i, null, req.user.sub, true);
      const { rows } = await pool.query<DeviceRow>(
        `insert into devices (tenant_id, name, os, address, mode, device_type, monitor, monitor_config, monitor_secret_enc)
         values ((select tenant_id from users where id = $1), $2,$3,$4,$5,$6,$7,$8,$9) returning id`,
        [req.user.sub, i.name, i.os, i.address, b.mode, i.type, i.monitor, JSON.stringify(b.config), b.secret ? vault.seal(JSON.stringify(b.secret)) : null]);
      if (i.monitor === 'ssh' && i.ssh?.keyId) takeKey(i.ssh.keyId, req.user.sub);
      await loadFleet();
      await audit(req.user.sub, 'device.add', i.name, 'ok', { address: i.address, monitor: b.mode });
      const row = findDevice(rows[0].id)!;
      void poll(row, true);
      return reply.code(201).send(deviceView(row));
    } catch (e) { return reply.code(400).send({ error: clean(e) }); }
  });

  app.put<{ Params: { id: string } }>('/api/v1/devices/:id', { preHandler: guard('device:manage') }, async (req, reply) => {
    const existing = findDevice(req.params.id);
    if (!existing) return reply.code(404).send({ error: 'Device not found' });
    try {
      const i = DeviceInput.parse(req.body);
      const b = buildMonitor(i, existing, req.user.sub, true);
      await pool.query(
        'update devices set name=$2, os=$3, address=$4, mode=$5, device_type=$6, monitor=$7, monitor_config=$8, monitor_secret_enc=$9 where id=$1',
        [existing.id, i.name, i.os, i.address, b.mode, i.type, i.monitor, JSON.stringify(b.config), b.secret ? vault.seal(JSON.stringify(b.secret)) : null]);
      if (i.monitor === 'ssh' && i.ssh?.keyId) takeKey(i.ssh.keyId, req.user.sub);
      resetLive(existing.id);
      await loadFleet();
      await audit(req.user.sub, 'device.update', i.name, 'ok', { address: i.address, monitor: b.mode });
      const row = findDevice(existing.id)!;
      void poll(row, true);
      return deviceView(row);
    } catch (e) { return reply.code(400).send({ error: clean(e) }); }
  });

  app.delete<{ Params: { id: string } }>('/api/v1/devices/:id', { preHandler: guard('device:manage') }, async (req, reply) => {
    const row = findDevice(req.params.id);
    if (!row) return reply.code(404).send({ error: 'Device not found' });
    await pool.query('delete from devices where id = $1', [row.id]);
    resetLive(row.id);
    forgetStatus(row.id);
    await loadFleet();
    await audit(req.user.sub, 'device.delete', row.name);
    return { ok: true };
  });

  // Try the settings before saving. Limited per user because it makes the server contact other hosts.
  app.post('/api/v1/devices/test', { preHandler: guard('device:manage') }, async (req, reply) => {
    const key = `probe:${req.user.sub}`;
    if (lockedFor([key])) return reply.code(429).send({ error: 'Too many connection tests. Try again in a few minutes.' });
    recordFail(key, 30);
    try {
      const body = DeviceInput.extend({ deviceId: z.string().uuid().optional() }).parse(req.body);
      const r = await probe(body, body.deviceId ? findDevice(body.deviceId) ?? null : null, req.user.sub);
      return { ok: true, ...r };
    } catch (e) { return reply.code(422).send({ error: clean(e) }); }
  });

  // ---- SSH setup helpers ----
  const COLLECTORS = process.env.COLLECTORS_DIR ?? path.join(path.dirname(fileURLToPath(import.meta.url)), '../collectors');
  const OsParam = z.object({ os: z.enum(['windows', 'linux']), name: z.string().max(60).default('device') });

  // A new key pair. The private half stays on the server; the response carries only the public line to install.
  app.post('/api/v1/ssh/keypair', { preHandler: guard('device:manage') }, async (req, reply) => {
    const q = OsParam.safeParse(req.body);
    if (!q.success) return reply.code(400).send({ error: 'Choose Windows or Linux.' });
    const k = newKey(req.user.sub);
    if (!k) return reply.code(429).send({ error: 'Too many unused keys. Save or wait for the earlier ones to expire (30 minutes).' });
    await audit(req.user.sub, 'ssh.keygen', q.data.name);
    return { keyId: k.keyId, publicKey: k.publicKey, authorizedLine: authorizedLine(q.data.os, k.publicKey, q.data.name) };
  });

  // The read-only collector script to install on the device
  app.get('/api/v1/ssh/collector', { preHandler: guard('device:manage') }, async (req, reply) => {
    const q = z.object({ os: z.enum(['windows', 'linux']) }).safeParse(req.query);
    if (!q.success) return reply.code(400).send({ error: 'Choose Windows or Linux.' });
    const file = q.data.os === 'windows' ? 'collect.ps1' : 'collect.sh';
    return reply.header('content-type', 'text/plain; charset=utf-8')
      .header('content-disposition', `attachment; filename="${q.data.os === 'windows' ? 'collect.ps1' : 'pulseboard-collect'}"`)
      .send(fs.readFileSync(path.join(COLLECTORS, file), 'utf8'));
  });

  // The authorized_keys line for a device that already has a key (to set up a second copy, or after a reinstall)
  app.get<{ Params: { id: string } }>('/api/v1/devices/:id/ssh-setup', { preHandler: guard('device:manage') }, async (req, reply) => {
    const row = findDevice(req.params.id);
    if (!row || row.monitor !== 'ssh') return reply.code(404).send({ error: 'This device does not use SSH.' });
    const pem = sshTargetOf(row).privateKey;
    return { authorizedLine: authorizedLine(/windows/i.test(row.os) ? 'windows' : 'linux', publicLineOf(pem), row.name) };
  });

  // ---- simulated-only actions (demo devices) ----
  app.post<{ Params: { id: string; action: string } }>('/api/v1/devices/:id/actions/:action', { preHandler: guard('machine:power') }, async (req, reply) => {
    const row = findDevice(req.params.id);
    if (!row || !ACTIONS.has(req.params.action)) return reply.code(404).send({ error: 'Device or action not found' });
    if (row.monitor !== 'simulated') return reply.code(409).send({ error: SIM_ONLY });
    await audit(req.user.sub, `device.${req.params.action}`, row.name, 'ok', { simulated: true });
    return { accepted: true, note: 'Simulated: no real machine was contacted' };
  });

  app.post<{ Params: { id: string; pid: string } }>('/api/v1/devices/:id/processes/:pid/kill', { preHandler: guard('process:kill') }, async (req, reply) => {
    const row = findDevice(req.params.id);
    if (!row) return reply.code(404).send({ error: 'Device not found' });
    if (row.monitor !== 'simulated') return reply.code(409).send({ error: SIM_ONLY });
    const list = processes(row.id);
    const i = list.findIndex((p) => String(p.pid) === req.params.pid);
    if (i < 0) return reply.code(404).send({ error: 'Process not found' });
    const [gone] = list.splice(i, 1);
    await audit(req.user.sub, 'process.kill', `${row.name}:${gone.name}`, 'ok', { pid: gone.pid, simulated: true });
    return { ok: true, note: 'Simulated: no real process was stopped' };
  });

  app.post<{ Params: { id: string; name: string; action: string } }>('/api/v1/devices/:id/services/:name/:action', { preHandler: guard('service:restart') }, async (req, reply) => {
    const row = findDevice(req.params.id);
    if (!row) return reply.code(404).send({ error: 'Device not found' });
    if (row.monitor !== 'simulated') return reply.code(409).send({ error: SIM_ONLY });
    const next = SERVICE_ACTIONS[req.params.action];
    const svc = services(row.id, row.os).find((s) => s.name === req.params.name);
    if (!next || !svc) return reply.code(404).send({ error: 'Service or action not found' });
    svc.state = next;
    await audit(req.user.sub, `service.${req.params.action}`, `${row.name}:${svc.name}`, 'ok', { simulated: true });
    return { ok: true, note: 'Simulated: no real service was changed' };
  });
}
