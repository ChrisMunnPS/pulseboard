'use client';
import type { DeviceStatus, ProcessInfo } from '@pulse/shared';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import Shell from '@/components/Shell';
import { api } from '@/lib/api';
import { SortTh, useSort } from '@/lib/sort';

interface Entry { id: string; name: string; status: DeviceStatus; monitor: string; processes: ProcessInfo[] }
const input = 'rounded-lg border border-line bg-raised px-3 py-1.5 text-sm';

export default function Processes() {
  const [data, setData] = useState<Entry[] | null>(null);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [device, setDevice] = useState('all');
  useEffect(() => { const load = () => api<Entry[]>('/api/v1/processes').then(setData).catch((e: Error) => setError(e.message)); load(); const t = setInterval(load, 15_000); return () => clearInterval(t); }, []);

  const all = (data ?? []).flatMap((e) => e.processes.map((p) => ({ ...p, device: e.name, id: e.id, how: e.monitor })));
  const shown = all.filter((p) => (device === 'all' || p.id === device) && p.name.toLowerCase().includes(q.toLowerCase()));
  const { rows, sort } = useSort(shown, { device: (p) => p.device, name: (p) => p.name, pid: (p) => p.pid, cpu: (p) => p.cpu, ram: (p) => p.memGb }, { key: 'cpu', dir: 'desc', tie: 'ram' });
  const withProcs = (data ?? []).filter((e) => e.processes.length > 0);

  return (
    <Shell live>
      <h1 className="mb-4 text-xl font-semibold">Processes</h1>
      {error && <p role="alert" className="mb-3 text-crit">✖ {error}</p>}
      <section className="overflow-x-auto rounded-xl border border-line bg-surface p-4" aria-label="Processes">
        <div className="mb-3 flex flex-wrap gap-2">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search processes" aria-label="Search processes" className={`${input} w-64`} />
          <select value={device} onChange={(e) => setDevice(e.target.value)} aria-label="Device" className={input}><option value="all">All devices</option>{withProcs.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</select>
        </div>
        <table className="w-full min-w-[40rem] text-left text-sm"><thead className="text-muted"><tr><SortTh label="Device" k="device" sort={sort} /><SortTh label="Process" k="name" sort={sort} /><SortTh label="PID" k="pid" sort={sort} /><SortTh label="CPU" k="cpu" sort={sort} /><SortTh label="Memory" k="ram" sort={sort} /></tr></thead>
          <tbody>{rows.slice(0, 300).map((p, i) => (
            <tr key={`${p.id}${p.pid}${i}`} className="border-t border-line"><td className="p-3"><Link href={`/devices/${p.id}`} className="text-accent hover:underline">{p.device}</Link></td><td className="p-3">{p.name}</td><td className="p-3 text-muted">{p.pid}</td>
              <td className="p-3">{p.cpu === null ? <span className="text-muted">–</span> : `${p.cpu}%`}</td><td className="p-3">{p.memGb} GB</td></tr>))}
            {rows.length === 0 && <tr><td className="p-3 text-muted" colSpan={5}>{data === null ? 'Loading…' : 'No processes yet. Monitor a device over SSH or SNMP to see its busiest processes.'}</td></tr>}</tbody></table>
        <p className="mt-2 text-xs text-muted">Each device reports its 12 to 30 busiest processes. Over SSH you get live CPU use; over SNMP the standard tables only give memory, so CPU shows “–”. Remote actions such as ending a process are not available.</p>
      </section>
    </Shell>
  );
}
