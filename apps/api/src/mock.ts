import type { DeviceStatus, NetworkInfo, ProcessInfo, ServiceInfo, Volume } from '@pulse/shared';

// Simulated live metrics. Replaced by real agent data in the collection phase.
export interface Sim { cpu: number; memory: number; disk: number; offline: boolean }
const sims = new Map<string, Sim>();
const clamp = (v: number) => Math.max(2, Math.min(99, v));

export function ensure(id: string, offline: boolean): Sim {
  let s = sims.get(id);
  if (!s) {
    s = offline
      ? { cpu: 0, memory: 0, disk: 0, offline }
      : { cpu: 20 + Math.random() * 50, memory: 35 + Math.random() * 45, disk: 40 + Math.random() * 50, offline };
    sims.set(id, s);
  }
  s.offline = offline;
  return s;
}

export function step(): void {
  for (const s of sims.values()) {
    if (s.offline) continue;
    s.cpu = clamp(s.cpu + (Math.random() - 0.5) * 8);
    s.memory = clamp(s.memory + (Math.random() - 0.5) * 3);
    s.disk = clamp(s.disk + (Math.random() - 0.5) * 0.4);
  }
}

export const health = (s: Sim): number =>
  s.offline
    ? 0
    : Math.max(0, Math.round(100 - Math.max(0, s.cpu - 60) * 0.8 - Math.max(0, s.memory - 70) * 0.6 - Math.max(0, s.disk - 80) * 1.2));

export function statusOf(s: Sim): DeviceStatus {
  if (s.offline) return 'offline';
  const h = health(s);
  return h >= 85 ? 'healthy' : h >= 60 ? 'warning' : 'critical';
}

// Per-device processes and services are kept in memory so kill / restart visibly change them (simulated).
const svcState = new Map<string, ServiceInfo[]>();
const procState = new Map<string, ProcessInfo[]>();
const WIN_SERVICES = ['Spooler', 'W3SVC', 'MSSQLSERVER', 'WinRM', 'BackupAgent', 'Dnscache'];
const NIX_SERVICES = ['sshd', 'nginx', 'postgresql', 'cron', 'backup-agent', 'systemd-resolved'];
const PROCS = ['sqlservr', 'nginx', 'node', 'svchost', 'backup-agent', 'dockerd', 'explorer', 'chrome'];

export function services(id: string, os = ''): ServiceInfo[] {
  let list = svcState.get(id);
  if (!list) {
    const names = /windows/i.test(os) ? WIN_SERVICES : NIX_SERVICES;
    list = names.map((name, i) => ({
      name,
      state: i === 2 && Math.random() < 0.4 ? 'Failed' : i === 4 && Math.random() < 0.5 ? 'Stopped' : 'Running',
    }));
    svcState.set(id, list);
  }
  return list;
}

export function processes(id: string): ProcessInfo[] {
  let list = procState.get(id);
  if (!list) {
    list = PROCS.map((name, i) => ({ pid: 1000 + i * 137, name, cpu: 0, memGb: +(0.2 + Math.random() * 3).toFixed(1) }));
    procState.set(id, list);
  }
  return list;
}

export function detail(id: string, os: string, s: Sim) {
  const network: NetworkInfo = s.offline
    ? { downMbps: 0, upMbps: 0, latencyMs: 0, lossPct: 100, jitterMs: 0 }
    : {
        downMbps: Math.round(100 + Math.random() * 300), upMbps: Math.round(20 + Math.random() * 80),
        latencyMs: Math.round(8 + Math.random() * 10), lossPct: +(Math.random() * 0.4).toFixed(1), jitterMs: +(1 + Math.random() * 3).toFixed(1),
      };
  const mounts = /windows/i.test(os) ? ['C:', 'D:', 'E:'] : ['/', '/data', '/backup'];
  const volumes: Volume[] = s.offline ? [] : [
    { mount: mounts[0], usedPct: Math.round(s.disk), smart: 'OK', lifePct: 91, sizeBytes: 512 * 1024 ** 3 },
    { mount: mounts[1], usedPct: Math.round(Math.max(10, s.disk - 30)), smart: 'OK', lifePct: null, sizeBytes: 1024 ** 4 },
    { mount: mounts[2], usedPct: 72, smart: 'Warning', lifePct: 64, sizeBytes: 2 * 1024 ** 4 },
  ];
  return {
    cores: s.offline ? [] : Array.from({ length: 8 }, () => Math.round(clamp(s.cpu + (Math.random() - 0.5) * 30))),
    volumes,
    network,
    processes: s.offline ? [] : processes(id).map((p) => ({ ...p, cpu: Math.round((Math.random() * s.cpu) / 2) })),
    services: services(id, os),
  };
}
