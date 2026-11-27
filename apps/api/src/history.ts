import { pool } from './db';
import { availability, RANGES, type Metric, type Range } from './history-math';
import type { DeviceRow } from './types';

/** Averaged points for one metric, for one device or the whole fleet. */
export async function series(metric: Metric, range: Range, deviceId: string | null): Promise<{ t: string; v: number }[]> {
  const { seconds, bucket } = RANGES[range];
  const { rows } = await pool.query(
    `select to_timestamp(floor(extract(epoch from time) / $3) * $3) as t, avg(value) as v
       from metrics where metric = $1 and time > now() - make_interval(secs => $2) and ($4::uuid is null or device_id = $4)
      group by 1 order by 1`,
    [metric, seconds, bucket, deviceId],
  );
  return rows.map((r) => ({ t: r.t.toISOString(), v: Math.round(Number(r.v) * 100) / 100 }));
}

export async function availabilityFor(range: Range, ids: string[]): Promise<Record<string, { pct: number | null; outages: number }>> {
  const { seconds } = RANGES[range];
  const to = Date.now(), from = to - seconds * 1000;
  const { rows } = await pool.query(
    `select device_id, extract(epoch from at) * 1000 as at, status from device_status_log
      where device_id = any($1::uuid[]) and at >= to_timestamp($2) - interval '400 days' order by at`,
    [ids, from / 1000],
  );
  const out: Record<string, { pct: number | null; outages: number }> = {};
  for (const id of ids) out[id] = availability(rows.filter((r) => r.device_id === id).map((r) => ({ at: Number(r.at), status: r.status })), from, to);
  return out;
}

/** Growth of the fullest volume over the last 14 days, in percentage points per day. */
export async function growth(): Promise<Record<string, { slope: number | null; samples: number; spanS: number }>> {
  const { rows } = await pool.query(
    `select device_id, regr_slope(value, extract(epoch from time)) * 86400 as slope, count(*)::int as n, extract(epoch from (max(time) - min(time))) as span
       from metrics where metric = 'disk' and time > now() - interval '14 days' group by device_id`);
  return Object.fromEntries(rows.map((r) => [r.device_id, { slope: r.slope === null ? null : Number(r.slope), samples: r.n, spanS: Number(r.span ?? 0) }]));
}

// ---- status-change log ----
const lastStatus = new Map<string, string>();
export async function trackStatus(devices: { id: string; status: string }[]): Promise<void> {
  for (const d of devices) {
    if (lastStatus.get(d.id) === d.status) continue;
    lastStatus.set(d.id, d.status);
    await pool.query('insert into device_status_log (device_id, status) values ($1, $2)', [d.id, d.status]);
  }
}
export const forgetStatus = (id: string): void => { lastStatus.delete(id); };

export async function purge(days: number): Promise<void> {
  await pool.query("delete from metrics where time < now() - make_interval(days => $1)", [days]);
  await pool.query("delete from device_status_log where at < now() - interval '400 days'");
}
