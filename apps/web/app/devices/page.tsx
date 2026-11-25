'use client';
import Link from 'next/link';
import Bar from '@/components/Bar';
import Shell from '@/components/Shell';
import SourceBadge from '@/components/SourceBadge';
import StatusPill from '@/components/StatusPill';
import { useFleet } from '@/lib/api';
import { isLive, RANK } from '@/lib/status';

export default function Devices() {
  const { devices, live } = useFleet();
  const rows = [...devices].sort((a, b) => RANK[a.status] - RANK[b.status] || a.name.localeCompare(b.name));
  return (
    <Shell live={live}>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Devices <span className="text-muted">({rows.length})</span></h1>
        <Link href="/devices/new" className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-on-accent">+ Add device</Link>
      </div>
      <div className="overflow-x-auto rounded-xl border border-line bg-surface">
        <table className="w-full text-left text-sm">
          <thead className="text-muted">
            <tr>{['Status', 'Name', 'Monitoring', 'Health', 'CPU', 'Memory', 'Storage', 'Latency'].map((h) => <th key={h} scope="col" className="border-b border-line p-3 font-medium">{h}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((d) => (
              <tr key={d.id} className="border-b border-line last:border-0">
                <td className="p-3"><StatusPill status={d.status} /></td>
                <td className="p-3"><Link href={`/devices/${d.id}`} className="font-semibold text-accent hover:underline">{d.name}</Link><div className="text-muted">{d.type} · {d.address}</div></td>
                <td className="p-3"><SourceBadge monitor={d.monitor} /></td>
                <td className="p-3">{isLive(d.status) ? `${d.health}%` : '–'}</td>
                {(['cpu', 'memory', 'disk'] as const).map((k) => (
                  <td key={k} className="p-3">{isLive(d.status) && d[k] !== null ? <Bar label={k} value={d[k] as number} warn={k === 'disk' ? 80 : 70} crit={k === 'disk' ? 92 : 90} /> : <span className="text-muted">–</span>}</td>
                ))}
                <td className="p-3">{d.latencyMs === null ? <span className="text-muted">–</span> : `${Math.round(d.latencyMs * 10) / 10} ms`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}
