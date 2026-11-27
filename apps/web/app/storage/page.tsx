'use client';
import type { DriveHealth, Volume } from '@pulse/shared';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import Bar from '@/components/Bar';
import Shell from '@/components/Shell';
import { api } from '@/lib/api';
import { SortTh, useSort } from '@/lib/sort';
import { fmtBytes } from '@/lib/status';

interface Entry { id: string; name: string; status: string; monitor: string; volumes: Volume[]; drives: DriveHealth[]; growthPctPerDay: number | null; daysUntilFull: number | null }
const card = 'rounded-xl border border-line bg-surface p-4';

export default function Storage() {
  const [data, setData] = useState<Entry[] | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { const load = () => api<Entry[]>('/api/v1/storage').then(setData).catch((e: Error) => setError(e.message)); load(); const t = setInterval(load, 30_000); return () => clearInterval(t); }, []);

  const real = (data ?? []).filter((e) => e.monitor !== 'simulated');
  const vols = real.flatMap((e) => e.volumes.map((v) => ({ ...v, device: e.name, id: e.id, growth: e.growthPctPerDay, days: e.daysUntilFull })));
  const drives = real.flatMap((e) => e.drives.map((d) => ({ ...d, device: e.name, id: e.id })));
  const v = useSort(vols, { device: (r) => r.device, mount: (r) => r.mount, used: (r) => r.usedPct, size: (r) => r.sizeBytes, growth: (r) => r.growth, days: (r) => r.days }, { key: 'used', dir: 'desc' });
  const dr = useSort(drives, { device: (r) => r.device, model: (r) => r.model, temp: (r) => r.tempC, status: (r) => (r.ok === false ? 0 : 1) }, { key: 'status', tie: 'device' });
  const nearFull = vols.filter((x) => x.usedPct >= 90).length, failing = drives.filter((d) => d.ok === false).length;

  return (
    <Shell live>
      <h1 className="mb-4 text-xl font-semibold">Storage</h1>
      {error && <p role="alert" className="mb-3 text-crit">✖ {error}</p>}
      <div className="mb-3 grid grid-cols-2 gap-3 md:grid-cols-4">
        {[['Volumes', String(vols.length), false], ['Over 90% full', String(nearFull), nearFull > 0], ['Drives', String(drives.length), false], ['Drives with problems', String(failing), failing > 0]].map(([k, val, hot]) => (
          <div key={String(k)} className={`${card} ${hot ? '!border-crit' : ''}`}><div className="text-sm text-muted">{k}</div><div className="text-2xl font-semibold">{val}</div>{hot && <span className="text-sm text-crit">✖ Needs attention</span>}</div>))}
      </div>
      <section className={`${card} overflow-x-auto`} aria-label="Volumes"><h2 className="mb-2 text-sm font-semibold text-muted">Volumes</h2>
        <table className="w-full min-w-[44rem] text-left text-sm"><thead className="text-muted"><tr><SortTh label="Device" k="device" sort={v.sort} /><SortTh label="Volume" k="mount" sort={v.sort} /><SortTh label="Used" k="used" sort={v.sort} /><SortTh label="Size" k="size" sort={v.sort} /><SortTh label="Growth per day" k="growth" sort={v.sort} /><SortTh label="Full in" k="days" sort={v.sort} /></tr></thead>
          <tbody>{v.rows.map((r, i) => (
            <tr key={`${r.id}${r.mount}${i}`} className="border-t border-line"><td className="p-3"><Link href={`/devices/${r.id}`} className="text-accent hover:underline">{r.device}</Link></td><td className="break-all p-3">{r.mount}</td>
              <td className="w-48 p-3"><Bar value={r.usedPct} warn={80} crit={92} label={`${r.mount} used`} /></td><td className="p-3">{fmtBytes(r.sizeBytes)}</td>
              <td className="p-3">{r.growth === null ? <span className="text-muted">–</span> : `${r.growth > 0 ? '+' : ''}${r.growth}%`}</td>
              <td className="p-3">{r.days === null ? <span className="text-muted">–</span> : <span className={r.days < 30 ? 'text-warn' : ''}>{r.days < 30 ? '▲ ' : ''}{r.days} days</span>}</td></tr>))}
            {vols.length === 0 && <tr><td className="p-3 text-muted" colSpan={6}>{data === null ? 'Loading…' : 'No volumes yet. Monitor a device over SNMP to see its storage.'}</td></tr>}</tbody></table>
        <p className="mt-2 text-xs text-muted">Growth and days until full are estimated from the fullest volume on each device, and appear once there are about 6 hours of readings.</p></section>
      <section className={`${card} mt-3 overflow-x-auto`} aria-label="Drives"><h2 className="mb-2 text-sm font-semibold text-muted">Drive health</h2>
        <table className="w-full min-w-[34rem] text-left text-sm"><thead className="text-muted"><tr><SortTh label="Device" k="device" sort={dr.sort} /><SortTh label="Drive" k="model" sort={dr.sort} /><SortTh label="Temperature" k="temp" sort={dr.sort} /><SortTh label="Status" k="status" sort={dr.sort} /></tr></thead>
          <tbody>{dr.rows.map((r, i) => (
            <tr key={`${r.id}${i}`} className="border-t border-line"><td className="p-3"><Link href={`/devices/${r.id}`} className="text-accent hover:underline">{r.device}</Link></td><td className="p-3">{r.model}</td><td className="p-3">{r.tempC === null ? '–' : `${r.tempC} °C`}</td>
              <td className="p-3">{r.status === null ? <span className="text-muted">Not reported</span> : <span className={r.ok === false ? 'text-crit' : 'text-ok'}>{r.ok === false ? '✖' : '●'} {r.status}</span>}</td></tr>))}
            {drives.length === 0 && <tr><td className="p-3 text-muted" colSpan={4}>No drive details reported. Synology NAS units report drive models, temperature and status over SNMP.</td></tr>}</tbody></table></section>
    </Shell>
  );
}
