import type { Volume } from '@pulse/shared';

export interface StorageRow { type: string; descr: string; units: number; size: number; used: number }
const RAM = '1.3.6.1.2.1.25.2.1.2', FIXED_DISK = '1.3.6.1.2.1.25.2.1.4';
// System and virtual mounts that are not real storage
const VIRTUAL = /^\/(dev|run|sys|proc|tmp|var\/run|var\/lock|boot\/efi)(\/|$)/;

/**
 * Memory excludes the file cache and buffers (Linux counts them as "used", which makes a healthy NAS look full).
 * Volumes skip system mounts, and mounts that share the same size and usage are one filesystem, so only the
 * shortest path is kept (for example /volume1 but not /volume1/@docker).
 */
export function summariseStorage(rows: StorageRow[]): { memory: number | null; volumes: Volume[] } {
  let memory: number | null = null;
  const ram = rows.find((r) => r.type === RAM && r.size > 0);
  if (ram) {
    const bytes = (r?: StorageRow) => (r ? r.used * r.units : 0);
    const cache = rows.find((r) => /^cached memory$/i.test(r.descr)), buffers = rows.find((r) => /^memory buffers$/i.test(r.descr));
    const used = Math.max(0, bytes(ram) - bytes(cache) - bytes(buffers));
    memory = Math.min(100, Math.round((used / (ram.size * ram.units)) * 100));
  }

  const seen = new Map<string, Volume>();
  for (const r of rows) {
    if (r.type !== FIXED_DISK || r.size <= 0 || r.used < 0 || VIRTUAL.test(r.descr)) continue;
    const sizeBytes = r.size * r.units;
    const v: Volume = { mount: r.descr.slice(0, 48), usedPct: Math.min(100, Math.round((r.used / r.size) * 100)), smart: null, lifePct: null, sizeBytes };
    const key = `${sizeBytes}:${r.used * r.units}`;
    const prev = seen.get(key);
    if (!prev || v.mount.length < prev.mount.length) seen.set(key, v);
  }
  return { memory, volumes: [...seen.values()].slice(0, 12) };
}
