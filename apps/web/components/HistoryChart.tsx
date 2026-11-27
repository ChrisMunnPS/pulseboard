'use client';
import { useEffect, useState } from 'react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api } from '@/lib/api';

export type Range = '24h' | '7d' | '30d';
export interface ChartLine { metric: string; label: string }
const COLORS = ['var(--accent)', 'var(--warn)'];

/** A trend over time for one or two metrics, for one device or the whole fleet. */
export default function HistoryChart({ title, lines, range, device, unit = '', scale = 1, max }: { title: string; lines: ChartLine[]; range: Range; device: string; unit?: string; scale?: number; max?: number }) {
  const [data, setData] = useState<Record<string, number | string>[] | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let live = true;
    setData(null); setError('');
    Promise.all(lines.map((l) => api<{ points: { t: string; v: number }[] }>(`/api/v1/history?metric=${l.metric}&range=${range}${device !== 'all' ? `&device=${device}` : ''}`)))
      .then((res) => {
        if (!live) return;
        const by = new Map<string, Record<string, number | string>>();
        res.forEach((r, i) => r.points.forEach((p) => { const row = by.get(p.t) ?? { t: p.t }; row[lines[i].metric] = Math.round(p.v * scale * 10) / 10; by.set(p.t, row); }));
        setData([...by.values()].sort((a, b) => String(a.t).localeCompare(String(b.t))));
      })
      .catch((e: Error) => live && setError(e.message));
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range, device, scale, lines.map((l) => l.metric).join()]);

  const fmt = (t: string) => { const d = new Date(t); return range === '24h' ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : d.toLocaleDateString([], { month: 'short', day: 'numeric' }); };
  const last = data?.at(-1);
  const summary = last ? lines.map((l) => `${l.label} ${last[l.metric] ?? 'no data'}${unit}`).join(', ') : 'no data yet';
  return (
    <section className="rounded-xl border border-line bg-surface p-4" aria-label={title}>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-muted">{title}</h2>
        {lines.length > 1 && <span className="flex gap-3 text-xs text-muted">{lines.map((l, i) => <span key={l.metric}><span style={{ color: COLORS[i] }} aria-hidden="true">●</span> {l.label}</span>)}</span>}
      </div>
      {error ? <p role="alert" className="text-sm text-crit">✖ {error}</p>
        : data === null ? <p className="text-sm text-muted">Loading…</p>
        : data.length === 0 ? <p className="text-sm text-muted">No readings yet for this period. Monitored devices report every 30 seconds.</p>
        : (
          <div className="h-44" role="img" aria-label={`${title}: latest ${summary}`}>
            <ResponsiveContainer>
              <LineChart data={data}>
                <CartesianGrid stroke="var(--border)" strokeDasharray="3 4" />
                <XAxis dataKey="t" tickFormatter={fmt} stroke="var(--muted)" fontSize={11} minTickGap={50} />
                <YAxis stroke="var(--muted)" fontSize={11} unit={unit} width={52} domain={[0, max ?? 'auto']} />
                <Tooltip labelFormatter={(t) => new Date(String(t)).toLocaleString()} contentStyle={{ background: 'var(--raised)', border: '1px solid var(--border)', color: 'var(--text)' }} />
                {lines.map((l, i) => <Line key={l.metric} type="monotone" dataKey={l.metric} name={l.label} stroke={COLORS[i]} strokeWidth={2} dot={false} connectNulls isAnimationActive={false} />)}
              </LineChart>
            </ResponsiveContainer>
          </div>)}
    </section>
  );
}
