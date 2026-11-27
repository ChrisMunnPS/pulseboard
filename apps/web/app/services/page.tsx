'use client';
import type { DeviceStatus, ServiceInfo } from '@pulse/shared';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import Shell from '@/components/Shell';
import { api } from '@/lib/api';
import { SortTh, useSort } from '@/lib/sort';

interface Entry { id: string; name: string; status: DeviceStatus; monitor: string; services: ServiceInfo[] }
const card = 'rounded-xl border border-line bg-surface p-4';
const input = 'rounded-lg border border-line bg-raised px-3 py-1.5 text-sm';
const ORDER = { Failed: 0, Stopped: 1, Running: 2 } as const;

export default function Services() {
  const [data, setData] = useState<Entry[] | null>(null);
  const [error, setError] = useState('');
  const [state, setState] = useState('all');
  const [q, setQ] = useState('');
  useEffect(() => { const load = () => api<Entry[]>('/api/v1/services').then(setData).catch((e: Error) => setError(e.message)); load(); const t = setInterval(load, 30_000); return () => clearInterval(t); }, []);

  const all = (data ?? []).flatMap((e) => e.services.map((s) => ({ ...s, device: e.name, id: e.id })));
  const shown = all.filter((s) => (state === 'all' || s.state === state) && `${s.name} ${s.display ?? ''} ${s.device}`.toLowerCase().includes(q.toLowerCase()));
  const { rows, sort } = useSort(shown, { device: (s) => s.device, name: (s) => s.display ?? s.name, state: (s) => ORDER[s.state], start: (s) => s.startType }, { key: 'state', tie: 'name' });
  const failed = all.filter((s) => s.state === 'Failed').length;
  const without = (data ?? []).filter((e) => e.services.length === 0);

  return (
    <Shell live>
      <h1 className="mb-4 text-xl font-semibold">Services</h1>
      {error && <p role="alert" className="mb-3 text-crit">✖ {error}</p>}
      <div className="mb-3 grid grid-cols-2 gap-3 md:grid-cols-4">
        {[['Services', all.length, false], ['Failed', failed, failed > 0], ['Stopped', all.filter((s) => s.state === 'Stopped').length, false], ['Running', all.filter((s) => s.state === 'Running').length, false]].map(([k, v, hot]) => (
          <div key={String(k)} className={`${card} ${hot ? '!border-crit' : ''}`}><div className="text-sm text-muted">{k}</div><div className="text-2xl font-semibold">{v as number}</div>{hot && <span className="text-sm text-crit">✖ Needs attention</span>}</div>))}
      </div>
      <section className={`${card} overflow-x-auto`} aria-label="Services">
        <div className="mb-3 flex flex-wrap gap-2">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search services or devices" aria-label="Search services" className={`${input} w-72`} />
          <select value={state} onChange={(e) => setState(e.target.value)} aria-label="Filter by state" className={input}><option value="all">All states</option><option value="Failed">Failed</option><option value="Stopped">Stopped</option><option value="Running">Running</option></select>
        </div>
        <table className="w-full min-w-[40rem] text-left text-sm"><thead className="text-muted"><tr><SortTh label="Device" k="device" sort={sort} /><SortTh label="Service" k="name" sort={sort} /><SortTh label="State" k="state" sort={sort} /><SortTh label="Starts" k="start" sort={sort} /></tr></thead>
          <tbody>{rows.slice(0, 500).map((s, i) => (
            <tr key={`${s.id}${s.name}${i}`} className="border-t border-line"><td className="p-3"><Link href={`/devices/${s.id}`} className="text-accent hover:underline">{s.device}</Link></td>
              <td className="p-3">{s.display ?? s.name}{s.display && <span className="text-muted"> · {s.name}</span>}</td>
              <td className="p-3">{s.state === 'Failed' ? <span className="text-crit">✖ Failed</span> : s.state === 'Running' ? <span className="text-ok">● Running</span> : <span className="text-muted">○ Stopped</span>}</td><td className="p-3">{s.startType ?? '–'}</td></tr>))}
            {rows.length === 0 && <tr><td className="p-3 text-muted" colSpan={4}>{data === null ? 'Loading…' : all.length === 0 ? 'No service data yet. Monitor a Windows or Linux computer over SSH to see its services.' : 'No services match.'}</td></tr>}</tbody></table>
        {rows.length > 500 && <p className="mt-2 text-xs text-muted">Showing the first 500. Use the search to narrow down.</p>}
        {without.length > 0 && all.length > 0 && <p className="mt-3 text-xs text-muted">No service list from: {without.map((e) => e.name).join(', ')}. Services come from computers monitored over SSH; SNMP, ping and TCP do not provide them.</p>}
      </section>
    </Shell>
  );
}
