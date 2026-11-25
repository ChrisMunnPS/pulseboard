import { pool } from './db';
import { collect, friendlySnmpError, type Counters, type SnmpCfg } from './snmp';
import { getLive } from './live';
import { runPing, tcpCheck } from './ping';
import type { DeviceRow } from './types';
import { vault } from './vault-instance';
import { config } from './config';

const counters: Counters = new Map();

/** Combines the stored (non-secret) settings with the decrypted secret. Only ever used in memory. */
export function snmpConfigOf(row: Pick<DeviceRow, 'monitor_config' | 'monitor_secret_enc'>): SnmpCfg {
  const c = row.monitor_config as Record<string, never>;
  const secret = row.monitor_secret_enc ? (JSON.parse(vault.open(row.monitor_secret_enc)) as Record<string, string>) : {};
  return { version: c.version ?? 'v2c', port: Number(c.port ?? 161), username: c.username, securityLevel: c.securityLevel, authProtocol: c.authProtocol, privProtocol: c.privProtocol, community: secret.community, authKey: secret.authKey, privKey: secret.privKey };
}

export async function poll(row: DeviceRow): Promise<void> {
  const l = getLive(row.id);
  l.polled = true;
  try {
    const metrics: [string, number | null][] = [];
    if (row.monitor === 'ping') {
      const r = await runPing(row.address);
      if (r.lossPct >= 100) throw new Error('No reply to ping. The device may be off, unreachable, or set to ignore ping.');
      l.network = { ...l.network, latencyMs: r.latencyMs, lossPct: r.lossPct, jitterMs: r.jitterMs };
    } else if (row.monitor === 'tcp') {
      const ms = await tcpCheck(row.address, Number((row.monitor_config as { port?: number }).port ?? 443));
      l.network = { ...l.network, latencyMs: ms, lossPct: 0, jitterMs: null };
    } else if (row.monitor === 'snmp') {
      const wantInventory = !l.inventory || Date.now() - l.inventoryAt > 3_600_000;
      const r = await collect(row.id, row.address, snmpConfigOf(row), counters, wantInventory).catch((e) => { throw new Error(friendlySnmpError(e)); });
      Object.assign(l, { sysDescr: r.sysDescr, uptimeS: r.uptimeS, cpu: r.cpu, memory: r.memory, disk: r.disk, cores: r.cores, volumes: r.volumes, interfaces: r.interfaces, processes: r.processes });
      if (r.inventory) { l.inventory = r.inventory; l.inventoryAt = Date.now(); }
      l.network = { downMbps: null, upMbps: null, latencyMs: r.rttMs, lossPct: 0, jitterMs: null };
    }
    l.misses = 0; l.lastSeen = Date.now(); l.error = null;
    metrics.push(['cpu', l.cpu], ['memory', l.memory], ['disk', l.disk], ['latency_ms', l.network.latencyMs], ['loss_pct', l.network.lossPct]);
    const kept = metrics.filter((m): m is [string, number] => m[1] !== null);
    if (kept.length) await pool.query('insert into metrics (time, device_id, metric, value) select now(), $1, unnest($2::text[]), unnest($3::float8[])', [row.id, kept.map((m) => m[0]), kept.map((m) => m[1])]);
    await pool.query('update devices set last_seen = now() where id = $1', [row.id]);
  } catch (e) {
    l.misses += 1;
    l.error = (e as Error).message;
  }
}

/** Polls every monitored device on an interval, a few at a time. Returns a function that polls once, right now. */
export function startPoller(getFleet: () => DeviceRow[], log: (m: string) => void): () => Promise<void> {
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try {
      const targets = getFleet().filter((d) => d.monitor !== 'simulated');
      for (let i = 0; i < targets.length; i += 8) await Promise.all(targets.slice(i, i + 8).map((d) => poll(d).catch((e: Error) => log(`Poll of ${d.name} failed: ${e.message}`))));
    } finally { running = false; }
  };
  setInterval(run, config.POLL_SECONDS * 1000);
  void run();
  return run;
}
