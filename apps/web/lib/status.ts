import type { DeviceStatus } from '@pulse/shared';

/** Worst first. Unknown (not checked yet) sits between offline and warning. */
export const RANK: Record<DeviceStatus, number> = { critical: 0, offline: 1, unknown: 2, warning: 3, healthy: 4 };
export const BORDER: Record<DeviceStatus, string> = { critical: 'border-crit pulse-crit', warning: 'border-warn', healthy: 'border-ok', offline: 'border-muted', unknown: 'border-muted' };
export const isLive = (s: DeviceStatus) => s !== 'offline' && s !== 'unknown';

export const avg = (xs: (number | null)[]): number | null => {
  const v = xs.filter((x): x is number => x !== null);
  return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null;
};
export const pct = (v: number | null) => (v === null ? '–' : `${v}%`);
export const rate = (bps: number | null) =>
  bps === null ? '–' : bps >= 1e9 ? `${(bps / 1e9).toFixed(1)} Gb/s` : bps >= 1e6 ? `${(bps / 1e6).toFixed(1)} Mb/s` : bps >= 1e3 ? `${(bps / 1e3).toFixed(1)} Kb/s` : `${bps} b/s`;
export const uptime = (s: number | null) => {
  if (s === null) return '–';
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m`;
};
/** Binary units with the usual labels (what Windows and NAS software show). */
export const fmtBytes = (b: number | null) => {
  if (b === null) return '–';
  const u = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  let i = 0, v = b;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `${v >= 100 || i === 0 ? Math.round(v) : v.toFixed(1)} ${u[i]}`;
};
export const ago = (iso: string | null) => {
  if (!iso) return 'never';
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  return s < 60 ? `${s}s ago` : s < 3600 ? `${Math.round(s / 60)}m ago` : s < 86400 ? `${Math.round(s / 3600)}h ago` : `${Math.round(s / 86400)}d ago`;
};
