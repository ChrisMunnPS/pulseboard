import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { audit, guard } from './auth';
import { pool } from './db';
import { findDevice, getFleet, loadFleet } from './fleet';
import { daysUntilFull, METRICS, RANGES } from './history-math';
import { availabilityFor, growth, series } from './history';
import { poll, VIRTUAL_IF } from './poller';
import { deviceDetail, deviceView } from './views';

const Range = z.enum(Object.keys(RANGES) as [keyof typeof RANGES, ...(keyof typeof RANGES)[]]);
const clean = (e: unknown) => (e instanceof z.ZodError ? e.issues[0]?.message ?? 'Invalid input' : (e as Error).message).slice(0, 200);

export async function registerInsightRoutes(app: FastifyInstance): Promise<void> {
  const read = { preHandler: guard('devices:read') };

  app.get('/api/v1/history', read, async (req, reply) => {
    try {
      const q = z.object({ metric: z.enum(METRICS), range: Range.default('24h'), device: z.string().uuid().optional() }).parse(req.query);
      return { points: await series(q.metric, q.range, q.device ?? null) };
    } catch (e) { return reply.code(400).send({ error: clean(e) }); }
  });

  app.get('/api/v1/availability', read, async (req, reply) => {
    try {
      const q = z.object({ range: Range.default('7d') }).parse(req.query);
      const ids = getFleet().map((d) => d.id);
      return await availabilityFor(q.range, ids);
    } catch (e) { return reply.code(400).send({ error: clean(e) }); }
  });

  app.get('/api/v1/storage', read, async () => {
    const g = await growth();
    return getFleet().map((row) => {
      const d = deviceDetail(row);
      // A rate of growth needs a meaningful stretch of history: at least 6 hours and 20 readings
      const gr = g[row.id] && g[row.id].spanS >= 21_600 && g[row.id].samples >= 20 ? g[row.id] : undefined;
      return {
        id: row.id, name: row.name, status: d.status, monitor: d.monitor, volumes: d.volumes, drives: d.drives,
        growthPctPerDay: gr?.slope == null ? null : Math.round(gr.slope * 100) / 100,
        daysUntilFull: daysUntilFull(d.disk, gr?.slope ?? null, gr?.samples ?? 0),
      };
    });
  });

  app.get('/api/v1/network', read, async () =>
    getFleet().map((row) => {
      const d = deviceDetail(row);
      return { id: row.id, name: row.name, status: d.status, monitor: d.monitor, latencyMs: d.network.latencyMs, lossPct: d.network.lossPct, jitterMs: d.network.jitterMs,
        ports: d.interfaces.map((i) => ({ ...i, virtual: VIRTUAL_IF.test(i.name) })) };
    }));

  // Real services and processes per device (demo devices are left out). SNMP devices have processes but no services.
  const monitored = () => getFleet().filter((r) => r.monitor !== 'simulated').map((r) => ({ row: r, d: deviceDetail(r) }));
  app.get('/api/v1/services', read, async () => monitored().map(({ row, d }) => ({ id: row.id, name: row.name, status: d.status, monitor: d.monitor, services: d.services })));
  app.get('/api/v1/processes', read, async () => monitored().map(({ row, d }) => ({ id: row.id, name: row.name, status: d.status, monitor: d.monitor, processes: d.processes })));

  app.get('/api/v1/connections', read, async () =>
    getFleet().map((row) => {
      const v = deviceView(row), m = deviceDetail(row).monitorInfo;
      return { id: row.id, name: row.name, address: row.address, type: v.type, monitor: v.monitor, mode: row.mode, status: v.status, paused: v.paused, lastSeen: m.lastSeen, lastError: m.lastError, uptimeS: m.uptimeS };
    }));

  // Check a device right now (operators and above)
  app.post<{ Params: { id: string } }>('/api/v1/devices/:id/poll', { preHandler: guard('device:poll') }, async (req, reply) => {
    const row = findDevice(req.params.id);
    if (!row) return reply.code(404).send({ error: 'Device not found' });
    if (row.monitor === 'simulated') return reply.code(409).send({ error: 'This device shows simulated data, so there is nothing to check.' });
    if (row.monitor_paused) return reply.code(409).send({ error: 'Monitoring is paused for this device. Resume it first.' });
    await poll(row, true);
    await audit(req.user.sub, 'device.poll', row.name);
    return deviceView(row);
  });

  // Pause or resume monitoring (owners and admins)
  app.post<{ Params: { id: string } }>('/api/v1/devices/:id/pause', { preHandler: guard('device:manage') }, async (req, reply) => {
    const row = findDevice(req.params.id);
    const body = z.object({ paused: z.boolean() }).safeParse(req.body);
    if (!row || !body.success) return reply.code(row ? 400 : 404).send({ error: row ? 'Send { "paused": true or false }' : 'Device not found' });
    await pool.query('update devices set monitor_paused = $2 where id = $1', [row.id, body.data.paused]);
    await loadFleet();
    await audit(req.user.sub, body.data.paused ? 'device.pause' : 'device.resume', row.name);
    return deviceView(findDevice(row.id)!);
  });
}
