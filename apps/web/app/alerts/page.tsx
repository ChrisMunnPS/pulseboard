'use client';
import type { Alert } from '@pulse/shared';
import { useCallback, useEffect, useState } from 'react';
import Shell from '@/components/Shell';
import StatusPill from '@/components/StatusPill';
import { api } from '@/lib/api';

const FILTERS = [['all', 'All'], ['critical', 'Critical'], ['warning', 'Warning'], ['info', 'Information']] as const;

export default function Alerts() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [filter, setFilter] = useState<(typeof FILTERS)[number][0]>('all');
  const [error, setError] = useState('');

  const load = useCallback(() => api<Alert[]>('/api/v1/alerts').then(setAlerts).catch((e: Error) => setError(e.message)), []);
  useEffect(() => { load(); }, [load]);

  async function ack(id: string) {
    setError('');
    try { await api(`/api/v1/alerts/${id}/ack`, { method: 'POST' }); await load(); } catch (e) { setError((e as Error).message); }
  }
  const shown = alerts.filter((a) => filter === 'all' || a.severity === filter);

  return (
    <Shell live>
      <h1 className="mb-4 text-xl font-semibold">Alerts</h1>
      <div className="mb-3 flex flex-wrap gap-2" role="group" aria-label="Filter by severity">
        {FILTERS.map(([key, label]) => (
          <button key={key} aria-pressed={filter === key} onClick={() => setFilter(key)}
            className={`rounded-lg border px-3 py-1.5 text-sm ${filter === key ? 'border-accent bg-accent text-on-accent' : 'border-line bg-raised'}`}>{label}</button>
        ))}
      </div>
      {error && <p role="alert" className="mb-3 text-sm text-crit">✖ {error}</p>}
      <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
        {shown.length === 0 && <li className="p-4 text-muted">No alerts match this filter.</li>}
        {shown.map((a) => (
          <li key={a.id} className="flex flex-wrap items-center gap-3 p-4">
            <StatusPill status={a.severity} />
            <div className="min-w-48 flex-1">
              <b>{a.title}</b>
              <div className="text-sm text-muted">{a.deviceName ?? 'All devices'} · {a.detail} · {new Date(a.openedAt).toLocaleString()}</div>
            </div>
            {a.state === 'open'
              ? <button onClick={() => ack(a.id)} className="rounded-lg border border-line bg-raised px-3 py-1.5 text-sm hover:border-accent">Acknowledge</button>
              : <span className="text-sm text-muted">Acknowledged</span>}
          </li>
        ))}
      </ul>
    </Shell>
  );
}
