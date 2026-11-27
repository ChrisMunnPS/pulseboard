export type Range = '24h' | '7d' | '30d';
/** How far back, and how wide each averaged point is (keeps every chart to a few hundred points). */
export const RANGES: Record<Range, { seconds: number; bucket: number }> = {
  '24h': { seconds: 86_400, bucket: 300 },
  '7d': { seconds: 604_800, bucket: 1800 },
  '30d': { seconds: 2_592_000, bucket: 7200 },
};
export const METRICS = ['cpu', 'memory', 'disk', 'latency_ms', 'loss_pct', 'temp_c', 'disk_temp_c', 'net_in_bps', 'net_out_bps'] as const;
export type Metric = (typeof METRICS)[number];

export interface StatusEvent { at: number; status: string }

/** Share of known time a device was not offline, and how many outages began inside the window. Times are in ms. */
export function availability(events: StatusEvent[], from: number, to: number): { pct: number | null; outages: number } {
  const sorted = [...events].sort((a, b) => a.at - b.at);
  let current: string | null = null;
  for (const e of sorted) if (e.at <= from) current = e.status;
  let cursor = from, known = 0, up = 0, outages = 0;
  const span = (until: number) => {
    if (current !== null && current !== 'unknown') { known += until - cursor; if (current !== 'offline') up += until - cursor; }
    cursor = until;
  };
  for (const e of sorted) {
    if (e.at <= from || e.at >= to) continue;
    span(e.at);
    if (e.status === 'offline' && current !== 'offline') outages++;
    current = e.status;
  }
  span(to);
  return { pct: known > 0 ? Math.round((up / known) * 1000) / 10 : null, outages };
}

/** Days until a volume is full at the recent rate of growth. null when there is too little data or no growth. */
export function daysUntilFull(currentPct: number | null, slopePctPerDay: number | null, samples: number): number | null {
  if (currentPct === null || slopePctPerDay === null || samples < 20 || slopePctPerDay <= 0.05) return null;
  return Math.max(0, Math.round((100 - currentPct) / slopePctPerDay));
}
