import { describe, expect, it } from 'vitest';
import { summariseStorage, type StorageRow } from './storage';

const RAM = '1.3.6.1.2.1.25.2.1.2', OTHER = '1.3.6.1.2.1.25.2.1.1', DISK = '1.3.6.1.2.1.25.2.1.4';
const GB = 1024 ** 3;
// Shaped like a Synology NAS: cache counted as used, system mounts, and one filesystem mounted many times
const rows: StorageRow[] = [
  { type: RAM, descr: 'Physical memory', units: 1024, size: (16 * GB) / 1024, used: (15.7 * GB) / 1024 },
  { type: OTHER, descr: 'Cached memory', units: 1024, size: (10 * GB) / 1024, used: (10 * GB) / 1024 },
  { type: OTHER, descr: 'Memory buffers', units: 1024, size: (1 * GB) / 1024, used: (1 * GB) / 1024 },
  { type: DISK, descr: '/', units: 4096, size: 2_000_000, used: 1_260_000 },
  { type: DISK, descr: '/dev/shm', units: 4096, size: 2_000_000, used: 0 },
  { type: DISK, descr: '/tmp', units: 4096, size: 2_000_000, used: 0 },
  { type: DISK, descr: '/volume1', units: 4096, size: 1_900_000_000, used: 1_767_000_000 },
  { type: DISK, descr: '/volume1/@docker', units: 4096, size: 1_900_000_000, used: 1_767_000_000 },
  { type: DISK, descr: '/volume1/@docker/btrfs', units: 4096, size: 1_900_000_000, used: 1_767_000_000 },
];

describe('summariseStorage', () => {
  it('does not count the file cache and buffers as used memory', () => {
    expect(summariseStorage(rows).memory).toBe(29); // (15.7 - 10 - 1) / 16
  });
  it('drops system mounts and duplicate mounts of one filesystem', () => {
    const v = summariseStorage(rows).volumes;
    expect(v.map((x) => x.mount)).toEqual(['/', '/volume1']);
    expect(v[1].usedPct).toBe(93);
    expect(v[1].sizeBytes).toBe(1_900_000_000 * 4096);
  });
  it('keeps Windows drives', () => {
    const w = summariseStorage([{ type: DISK, descr: 'C:\\ Label:OS', units: 4096, size: 1000, used: 500 }]).volumes;
    expect(w[0].mount).toBe('C:\\ Label:OS');
  });
  it('returns null memory when the device reports none', () => {
    expect(summariseStorage([]).memory).toBeNull();
  });
});
