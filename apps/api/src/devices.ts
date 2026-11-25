import { DeviceInput } from '@pulse/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { audit, guard } from './auth';
import { pool } from './db';
import { findDevice, getFleet, loadFleet } from './fleet';
import { resetLive } from './live';
import { processes, services } from './mock';
import { checkMonitorAddress } from './netsafe';
import { poll } from './poller';
import { runPing, tcpCheck } from './ping';
import { lockedFor, recordFail } from './ratelimit';
import { friendlySnmpError, identify, type SnmpCfg } from './snmp';
import type { DeviceRow } from './types';
import { vault } from './vault-instance';
import { deviceDetail, deviceView } from './views';

interface Built { config: Record<string, unknown>; secret: Record<string, string> | null; mode: string }
const MIN_KEY = 8;
const clean = (e: unknown): string => (e instanceof z.ZodError ? e.issues[0]?.message ?? 'Invalid input' : (e as Error).message).slice(0, 220);

/** Turns the form into stored settings plus a secret. On edit, a blank secret keeps the saved one. */
function buildMonitor(i: DeviceInput, existing: DeviceRow | null): Built {
  const bad = checkMonitorAddress(i.address);
  if (bad) throw new Error(bad);
  if (i.monitor === 'ping') return { config: {}, secret: null, mode: 'ping' };
  if (i.monitor === 'tcp') return { config: { port: i.port ?? 443 }, secret: null, mode: 'tcp' };
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

async function probe(i: DeviceInput, existing: DeviceRow | null): Promise<string> {
  const b = buildMonitor(i, existing);
  if (i.monitor === 'ping') {
    const r = await runPing(i.address);
    if (r.lossPct >= 100) throw new Error('No reply to ping. The device may be off, unreachable, or set to ignore ping.');
    return `Reply in ${r.latencyMs} ms, ${r.lossPct}% packet loss.`;
  }
  if (i.monitor === 'tcp') return `Port ${i.port ?? 443} answered in ${await tcpCheck(i.address, i.port ?? 443)} ms.`;
  const id = await identify(i.address, snmpCfgOf(b)).catch((e) => { throw new Error(friendlySnmpError(e)); });
  return `SNMP ${i.snmp?.version} works (${id.rttMs} ms): ${(id.sysName || id.sysDescr).slice(0, 90)}`;
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
      const b = buildMonitor(i, null);
      const { rows } = await pool.query<DeviceRow>(
        `insert into devices (tenant_id, name, os, address, mode, device_type, monitor, monitor_config, monitor_secret_enc)
         values ((select tenant_id from users where id = $1), $2,$3,$4,$5,$6,$7,$8,$9) returning id`,
        [req.user.sub, i.name, i.os, i.address, b.mode, i.type, i.monitor, JSON.stringify(b.config), b.secret ? vault.seal(JSON.stringify(b.secret)) : null]);
      await loadFleet();
      await audit(req.user.sub, 'device.add', i.name, 'ok', { address: i.address, monitor: b.mode });
      const row = findDevice(rows[0].id)!;
      void poll(row);
      return reply.code(201).send(deviceView(row));
    } catch (e) { return reply.code(400).send({ error: clean(e) }); }
  });

  app.put<{ Params: { id: string } }>('/api/v1/devices/:id', { preHandler: guard('device:manage') }, async (req, reply) => {
    const existing = findDevice(req.params.id);
    if (!existing) return reply.code(404).send({ error: 'Device not found' });
    try {
      const i = DeviceInput.parse(req.body);
      const b = buildMonitor(i, existing);
      await pool.query(
        'update devices set name=$2, os=$3, address=$4, mode=$5, device_type=$6, monitor=$7, monitor_config=$8, monitor_secret_enc=$9 where id=$1',
        [existing.id, i.name, i.os, i.address, b.mode, i.type, i.monitor, JSON.stringify(b.config), b.secret ? vault.seal(JSON.stringify(b.secret)) : null]);
      resetLive(existing.id);
      await loadFleet();
      await audit(req.user.sub, 'device.update', i.name, 'ok', { address: i.address, monitor: b.mode });
      const row = findDevice(existing.id)!;
      void poll(row);
      return deviceView(row);
    } catch (e) { return reply.code(400).send({ error: clean(e) }); }
  });

  app.delete<{ Params: { id: string } }>('/api/v1/devices/:id', { preHandler: guard('device:manage') }, async (req, reply) => {
    const row = findDevice(req.params.id);
    if (!row) return reply.code(404).send({ error: 'Device not found' });
    await pool.query('delete from devices where id = $1', [row.id]);
    resetLive(row.id);
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
      const msg = await probe(body, body.deviceId ? findDevice(body.deviceId) ?? null : null);
      return { ok: true, message: msg };
    } catch (e) { return reply.code(422).send({ error: clean(e) }); }
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
