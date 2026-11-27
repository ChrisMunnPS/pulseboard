'use client';
import type { Device } from '@pulse/shared';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import Bar from '@/components/Bar';
import HistoryChart, { type Range } from '@/components/HistoryChart';
import Shell from '@/components/Shell';
import { api, useFleet } from '@/lib/api';
import { SortTh, useSort } from '@/lib/sort';
import { isLive } from '@/lib/status';

const RANGES: Range[] = ['24h', '7d', '30d'];
type Avail = Record<string, { pct: number | null; outages: number }>;
const card = 'rounded-xl border border-line bg-surface p-4';

function Top({ title, devices, pick }: { title: string; devices: Device[]; pick: (d: Device) => number | null }) {
  const rows = devices.filter((d) => isLive(d.status) && pick(d) !== null).sort((a, b) => (pick(b) ?? 0) - (pick(a) ?? 0)).slice(0, 5);
  return (
    <section className={card} aria-label={title}><h2 className="mb-2 text-sm font-semibold text-muted">{title}</h2>
      {rows.length === 0 ? <p className="text-sm text-muted">No device reports this yet.</p> : rows.map((d) => (
        <div key={d.id} className="my-2 flex items-center gap-3"><Link href={`/devices/${d.id}`} className="w-32 truncate text-accent hover:underline">{d.name}</Link><div className="flex-1"><Bar value={pick(d) as number} label={`${d.name} ${title}`} /></div></div>))}
    </section>
  );
}

export default function Performance() {
  const { devices, live } = useFleet();
  const [range, setRange] = useState<Range>('24h');
  const [device, setDevice] = useState('all');
  const [avail, setAvail] = useState<Avail>({});
  useEffect(() => { api<Avail>(`/api/v1/availability?range=${range}`).then(setAvail).catch(() => setAvail({})); }, [range]);

  const { rows, sort } = useSort(devices.filter((d) => d.monitor !== 'simulated'), { name: (d) => d.name, pct: (d) => avail[d.id]?.pct ?? null, outages: (d) => avail[d.id]?.outages ?? null }, { key: 'pct' });
  return (
    <Shell live={live}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Performance</h1>
        <div className="flex flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor="dev">Device</label>
          <select id="dev" value={device} onChange={(e) => setDevice(e.target.value)} className="rounded-lg border border-line bg-raised px-3 py-1.5 text-sm">
            <option value="all">All devices (average)</option>{devices.filter((d) => d.monitor !== 'simulated').map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
          <div role="group" aria-label="Time range" className="flex gap-1">{RANGES.map((r) => <button key={r} aria-pressed={range === r} onClick={() => setRange(r)} className={`rounded-lg border px-3 py-1.5 text-sm ${range === r ? 'border-accent bg-accent text-on-accent' : 'border-line bg-raised'}`}>{r}</button>)}</div>
        </div>
      </div>
      {devices.some((d) => d.monitor === 'simulated') && <p className="mb-3 text-sm text-muted">◌ Devices showing simulated data are left out of these charts.</p>}
      <div className="grid gap-3 lg:grid-cols-2">
        <HistoryChart title="CPU" lines={[{ metric: 'cpu', label: 'CPU' }]} range={range} device={device} unit="%" max={100} />
        <HistoryChart title="Memory" lines={[{ metric: 'memory', label: 'Memory' }]} range={range} device={device} unit="%" max={100} />
        <HistoryChart title="Latency" lines={[{ metric: 'latency_ms', label: 'Latency' }]} range={range} device={device} unit=" ms" />
        <HistoryChart title="Network throughput" lines={[{ metric: 'net_in_bps', label: 'In' }, { metric: 'net_out_bps', label: 'Out' }]} range={range} device={device} unit=" Mb/s" scale={1e-6} />
        <HistoryChart title="Temperature" lines={[{ metric: 'temp_c', label: 'System' }, { metric: 'disk_temp_c', label: 'Hottest drive' }]} range={range} device={device} unit=" °C" />
        <HistoryChart title="Packet loss" lines={[{ metric: 'loss_pct', label: 'Loss' }]} range={range} device={device} unit="%" max={100} />
      </div>
      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <Top title="Top CPU users" devices={devices} pick={(d) => d.cpu} />
        <Top title="Top memory users" devices={devices} pick={(d) => d.memory} />
      </div>
      <section className={`${card} mt-3 overflow-x-auto`} aria-label="Availability"><h2 className="mb-2 text-sm font-semibold text-muted">Availability, last {range}</h2>
        <table className="w-full text-left text-sm"><thead className="text-muted"><tr><SortTh label="Device" k="name" sort={sort} /><SortTh label="Available" k="pct" sort={sort} /><SortTh label="Outages" k="outages" sort={sort} /></tr></thead>
          <tbody>{rows.map((d) => <tr key={d.id} className="border-t border-line"><td className="p-3"><Link href={`/devices/${d.id}`} className="text-accent hover:underline">{d.name}</Link></td>
            <td className="p-3">{avail[d.id]?.pct == null ? <span className="text-muted">Collecting data</span> : <span className={avail[d.id].pct! < 99 ? 'text-warn' : ''}>{avail[d.id].pct}%</span>}</td><td className="p-3">{avail[d.id]?.outages ?? '–'}</td></tr>)}
            {rows.length === 0 && <tr><td className="p-3 text-muted" colSpan={3}>No monitored devices yet. Add one with ping, TCP or SNMP.</td></tr>}</tbody></table></section>
    </Shell>
  );
}
