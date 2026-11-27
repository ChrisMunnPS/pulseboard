'use client';
import Link from 'next/link';
import Bar from '@/components/Bar';
import Shell from '@/components/Shell';
import SourceBadge from '@/components/SourceBadge';
import StatusPill from '@/components/StatusPill';
import { useFleet } from '@/lib/api';
import { SortTh, useSort } from '@/lib/sort';
import { isLive, RANK } from '@/lib/status';

export default function Devices() {
  const { devices, live } = useFleet();
  const { rows, sort } = useSort(devices, {
    status: (d) => RANK[d.status], name: (d) => d.name, monitor: (d) => d.monitor, health: (d) => (isLive(d.status) ? d.health : null),
    cpu: (d) => (isLive(d.status) ? d.cpu : null), memory: (d) => (isLive(d.status) ? d.memory : null), disk: (d) => (isLive(d.status) ? d.disk : null), latency: (d) => d.latencyMs,
  }, { key: 'status', tie: 'name' });
  return (
    <Shell live={live}>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Devices <span className="text-muted">({rows.length})</span></h1>
        <Link href="/devices/new" className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-on-accent">+ Add device</Link>
      </div>
      <div className="overflow-x-auto rounded-xl border border-line bg-surface">
        <table className="w-full text-left text-sm">
          <thead className="text-muted">
            <tr>
              <SortTh label="Status" k="status" sort={sort} /><SortTh label="Name" k="name" sort={sort} /><SortTh label="Monitoring" k="monitor" sort={sort} /><SortTh label="Health" k="health" sort={sort} />
              <SortTh label="CPU" k="cpu" sort={sort} /><SortTh label="Memory" k="memory" sort={sort} /><SortTh label="Storage" k="disk" sort={sort} /><SortTh label="Latency" k="latency" sort={sort} />
            </tr>
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
