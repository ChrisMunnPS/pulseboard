import { z } from 'zod';

// Everything a collector script returns is untrusted input: sizes are capped and every field is validated.
const ns = (n = 200) => z.string().max(n).nullable().optional().transform((v) => v ?? null);
const nn = z.number().nullable().optional().transform((v) => v ?? null);

export const Metrics = z.object({
  schema: z.literal(1),
  hostname: ns(), os: ns(), uptimeS: nn,
  cpu: z.object({ model: ns(), loadPct: nn, perCore: z.array(z.number()).max(256).default([]) }),
  memory: z.object({ totalBytes: nn, usedBytes: nn }),
  volumes: z.array(z.object({ mount: z.string().max(80), label: ns(80), fs: ns(30), sizeBytes: nn, freeBytes: nn })).max(64).default([]),
  network: z.array(z.object({ name: z.string().max(80), mac: ns(40), up: z.boolean().nullable().optional().transform((v) => v ?? null), speedMbps: nn, inBps: nn, outBps: nn })).max(128).default([]),
  processes: z.array(z.object({ pid: z.number().int(), name: z.string().max(80), cpuPct: nn, memBytes: nn })).max(500).default([]),
  services: z.array(z.object({ name: z.string().max(120), display: ns(200), state: z.enum(['Running', 'Stopped', 'Failed']), startType: ns(30) })).max(3000).default([]),
});
export type Metrics = z.infer<typeof Metrics>;

export const InventoryDoc = z.object({
  schema: z.literal(1),
  hostname: ns(), osName: ns(), osBuild: ns(),
  system: z.object({ manufacturer: ns(), model: ns(), serial: ns(), biosVersion: ns(), biosDate: ns(), boardManufacturer: ns(), boardModel: ns(), boardSerial: ns() }),
  cpu: z.object({ model: ns(), cores: nn, threads: nn }),
  memory: z.object({ totalBytes: nn }),
  ramModules: z.array(z.object({ slot: ns(60), sizeBytes: nn, speedMhz: nn, type: ns(20), manufacturer: ns(60), partNumber: ns(60), serial: ns(60) })).max(64).default([]),
  disks: z.array(z.object({ model: ns(120), serial: ns(80), sizeBytes: nn, mediaType: ns(30), health: ns(40), tempC: nn })).max(64).default([]),
  gpus: z.array(z.object({ name: z.string().max(120), driver: ns(60), vramBytes: nn })).max(16).default([]),
  apps: z.array(z.object({ name: z.string().max(150), version: ns(60) })).max(1000).default([]),
});
export type InventoryDoc = z.infer<typeof InventoryDoc>;
