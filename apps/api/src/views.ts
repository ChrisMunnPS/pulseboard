import type { Device, DeviceDetail, DeviceStatus, MonitorInfo } from '@pulse/shared';
import { getLive, type Live } from './live';
import { detail as simDetail, ensure, health as simHealth, services, statusOf as simStatus } from './mock';
import type { DeviceRow } from './types';

const statusFromHealth = (h: number): DeviceStatus => (h >= 85 ? 'healthy' : h >= 60 ? 'warning' : 'critical');

function realHealth(l: Live): number {
  let h = 100;
  if (l.cpu !== null) h -= Math.max(0, l.cpu - 60) * 0.8;
  if (l.memory !== null) h -= Math.max(0, l.memory - 70) * 0.6;
  if (l.disk !== null) h -= Math.max(0, l.disk - 80) * 1.2;
  if (l.network.lossPct) h -= l.network.lossPct * 2;
  if (l.network.latencyMs !== null && l.network.latencyMs > 200) h -= 10;
  return Math.max(0, Math.round(h));
}

function realStatus(l: Live): DeviceStatus {
  if (!l.polled || l.lastSeen === null) return l.misses >= 2 ? 'offline' : 'unknown';
  return l.misses >= 2 ? 'offline' : statusFromHealth(realHealth(l));
}

export function deviceView(row: DeviceRow): Device {
  const base = { id: row.id, name: row.name, os: row.os, address: row.address, type: row.device_type, monitor: row.monitor, paused: row.monitor_paused };
  if (row.monitor === 'simulated') {
    const s = ensure(row.id, row.offline);
    return { ...base, status: simStatus(s), health: simHealth(s), cpu: Math.round(s.cpu), memory: Math.round(s.memory), disk: Math.round(s.disk), latencyMs: null };
  }
  const l = getLive(row.id);
  const status = row.monitor_paused ? 'unknown' : realStatus(l);
  return { ...base, status, health: status === 'offline' || status === 'unknown' ? 0 : realHealth(l), cpu: l.cpu, memory: l.memory, disk: l.disk, latencyMs: l.network.latencyMs };
}

const monitorInfo = (row: DeviceRow, l: Live | null): MonitorInfo => {
  const c = row.monitor_config as Record<string, string | number | undefined>;
  return {
    monitor: row.monitor, port: typeof c.port === 'number' ? c.port : null,
    snmpVersion: (c.version as 'v2c' | 'v3' | undefined) ?? null, username: (c.username as string) ?? null, securityLevel: (c.securityLevel as MonitorInfo['securityLevel']) ?? null,
    authProtocol: (c.authProtocol as string) ?? null, privProtocol: (c.privProtocol as string) ?? null,
    sshUsername: row.monitor === 'ssh' ? (c.username as string) ?? null : null, hostKey: row.monitor === 'ssh' ? (c.hostKey as string) ?? null : null,
    hasSecret: !!row.monitor_secret_enc,
    lastError: l?.error ?? null, sysDescr: l?.sysDescr ?? null, uptimeS: l?.uptimeS ?? null, lastSeen: l?.lastSeen ? new Date(l.lastSeen).toISOString() : null,
  };
};

export function deviceDetail(row: DeviceRow): DeviceDetail {
  const view = deviceView(row);
  if (row.monitor === 'simulated') {
    return { ...view, ...simDetail(row.id, row.os, ensure(row.id, row.offline)), interfaces: [], inventory: null, temperatureC: null, drives: [], monitorInfo: monitorInfo(row, null) };
  }
  const l = getLive(row.id);
  return { ...view, inventory: l.inventory, temperatureC: l.temperatureC, drives: l.drives, cores: l.cores, volumes: l.volumes, network: l.network, interfaces: l.interfaces, processes: l.processes, services: l.services, monitorInfo: monitorInfo(row, l) };
}

/** What the rule engine looks at, whether the numbers are simulated or real. */
export function metricsOf(row: DeviceRow) {
  const v = deviceView(row);
  const l = row.monitor === 'simulated' ? null : getLive(row.id);
  const failed = row.monitor === 'simulated' ? services(row.id, row.os).filter((s) => s.state === 'Failed').map((s) => s.name) : (l?.services ?? []).filter((s) => s.state === 'Failed').map((s) => s.name);
  const temps = [l?.temperatureC ?? null, ...(l?.drives.map((d) => d.tempC) ?? [])].filter((t): t is number => t !== null);
  const driveIssues = (l?.drives ?? []).filter((d) => d.ok === false).map((d) => `${d.model}: ${d.status}`);
  return { status: v.status, cpu: v.cpu, memory: v.memory, disk: v.disk, failed, temperature: temps.length ? Math.max(...temps) : null, driveIssues, hasDriveData: (l?.drives.length ?? 0) > 0 };
}
