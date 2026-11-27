'use client';
import type { DeviceStatus, IfaceInfo } from '@pulse/shared';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import Shell from '@/components/Shell';
import StatusPill from '@/components/StatusPill';
import { api } from '@/lib/api';
import { SortTh, useSort } from '@/lib/sort';
import { RANK, rate } from '@/lib/status';

type Port = IfaceInfo & { virtual: boolean };
interface Entry { id: string; name: string; status: DeviceStatus; monitor: string; latencyMs: number | null; lossPct: number | null; jitterMs: number | null; ports: Port[] }
const card = 'rounded-xl border border-line bg-surface p-4';
const ms = (v: number | null) => (v === null ? <span className="text-muted">–</span> : `${Math.round(v * 10) / 10} ms`);

export default function Network() {
  const [data, setData] = useState<Entry[] | null>(null);
  const [error, setError] = useState('');
  const [downOnly, setDownOnly] = useState(false);
  const [virtual, setVirtual] = useState(false);
  useEffect(() => { const load = () => api<Entry[]>('/api/v1/network').then(setData).catch((e: Error) => setError(e.message)); load(); const t = setInterval(load, 10_000); return () => clearInterval(t); }, []);

  const real = (data ?? []).filter((e) => e.monitor !== 'simulated');
  const ports = real.flatMap((e) => e.ports.map((p) => ({ ...p, device: e.name, id: e.id }))).filter((p) => (virtual || !p.virtual) && (!downOnly || p.up === false));
  const dv = useSort(real, { name: (e) => e.name, status: (e) => RANK[e.status], latency: (e) => e.latencyMs, loss: (e) => e.lossPct, jitter: (e) => e.jitterMs, ports: (e) => e.ports.filter((p) => !p.virtual && p.up).length }, { key: 'status', tie: 'name' });
  const pt = useSort(ports, { device: (p) => p.device, name: (p) => p.name, up: (p) => (p.up === null ? null : p.up ? 0 : 1), speed: (p) => p.speedMbps, inBps: (p) => p.inBps, outBps: (p) => p.outBps }, { key: 'inBps', dir: 'desc' });

  return (
    <Shell live>
      <h1 className="mb-4 text-xl font-semibold">Network</h1>
      {error && <p role="alert" className="mb-3 text-crit">✖ {error}</p>}
      <section className={`${card} overflow-x-auto`} aria-label="Devices"><h2 className="mb-2 text-sm font-semibold text-muted">Reachability</h2>
        <table className="w-full min-w-[40rem] text-left text-sm"><thead className="text-muted"><tr><SortTh label="Device" k="name" sort={dv.sort} /><SortTh label="Status" k="status" sort={dv.sort} /><SortTh label="Latency" k="latency" sort={dv.sort} /><SortTh label="Packet loss" k="loss" sort={dv.sort} /><SortTh label="Jitter" k="jitter" sort={dv.sort} /><SortTh label="Ports up" k="ports" sort={dv.sort} /></tr></thead>
          <tbody>{dv.rows.map((e) => { const phys = e.ports.filter((p) => !p.virtual); return (
            <tr key={e.id} className="border-t border-line"><td className="p-3"><Link href={`/devices/${e.id}`} className="text-accent hover:underline">{e.name}</Link></td><td className="p-3"><StatusPill status={e.status} /></td><td className="p-3">{ms(e.latencyMs)}</td>
              <td className="p-3">{e.lossPct === null ? <span className="text-muted">–</span> : <span className={e.lossPct > 0 ? 'text-warn' : ''}>{e.lossPct}%</span>}</td><td className="p-3">{ms(e.jitterMs)}</td>
              <td className="p-3">{phys.length ? `${phys.filter((p) => p.up).length} of ${phys.length}` : <span className="text-muted">–</span>}</td></tr>); })}
            {real.length === 0 && <tr><td className="p-3 text-muted" colSpan={6}>{data === null ? 'Loading…' : 'No monitored devices yet. Add one with ping, TCP or SNMP.'}</td></tr>}</tbody></table></section>

      <section className={`${card} mt-3 overflow-x-auto`} aria-label="Ports">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2"><h2 className="text-sm font-semibold text-muted">Ports ({ports.length})</h2>
          <div className="flex flex-wrap gap-4 text-sm"><label className="flex items-center gap-2"><input type="checkbox" checked={downOnly} onChange={(e) => setDownOnly(e.target.checked)} /> Only ports that are down</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={virtual} onChange={(e) => setVirtual(e.target.checked)} /> Include virtual ports</label></div></div>
        <table className="w-full min-w-[40rem] text-left text-sm"><thead className="text-muted"><tr><SortTh label="Device" k="device" sort={pt.sort} /><SortTh label="Port" k="name" sort={pt.sort} /><SortTh label="Status" k="up" sort={pt.sort} /><SortTh label="Speed" k="speed" sort={pt.sort} /><SortTh label="In" k="inBps" sort={pt.sort} /><SortTh label="Out" k="outBps" sort={pt.sort} /></tr></thead>
          <tbody>{pt.rows.map((p, i) => (
            <tr key={`${p.id}${p.index}${i}`} className="border-t border-line"><td className="p-3"><Link href={`/devices/${p.id}`} className="text-accent hover:underline">{p.device}</Link></td><td className="p-3"><b>{p.name}</b>{p.alias && <span className="text-muted"> · {p.alias}</span>}</td>
              <td className="p-3">{p.up === null ? '–' : p.up ? <span className="text-ok">● Up</span> : <span className="text-muted">○ Down</span>}</td><td className="p-3">{p.speedMbps ? `${p.speedMbps} Mb/s` : '–'}</td><td className="p-3">{rate(p.inBps)}</td><td className="p-3">{rate(p.outBps)}</td></tr>))}
            {ports.length === 0 && <tr><td className="p-3 text-muted" colSpan={6}>{downOnly ? 'No ports are down. ✔' : 'No ports reported. Routers, switches and NAS units report them over SNMP.'}</td></tr>}</tbody></table>
        <p className="mt-2 text-xs text-muted">Rates are the change since the previous check, so each port shows “–” until a device has been polled twice.</p></section>
    </Shell>
  );
}
