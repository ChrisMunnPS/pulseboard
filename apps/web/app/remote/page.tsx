'use client';
import type { DeviceStatus } from '@pulse/shared';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import Shell from '@/components/Shell';
import StatusPill from '@/components/StatusPill';
import { api, currentRole } from '@/lib/api';
import { SortTh, useSort } from '@/lib/sort';
import { ago, RANK, uptime } from '@/lib/status';
import { useToast } from '@/lib/toast';

interface Conn { id: string; name: string; address: string; type: string; monitor: string; mode: string; status: DeviceStatus; paused: boolean; lastSeen: string | null; lastError: string | null; uptimeS: number | null }
const btn = 'rounded-lg border border-line bg-raised px-3 py-1.5 text-sm hover:border-accent disabled:cursor-not-allowed disabled:opacity-40';
const METHOD: Record<string, string> = { ping: 'Ping', tcp: 'TCP port', 'snmp-v2c': 'SNMP v2c', 'snmp-v3': 'SNMP v3', ssh: 'SSH' };

export default function Remote() {
  const [data, setData] = useState<Conn[] | null>(null);
  const [role, setRole] = useState('');
  const [busy, setBusy] = useState('');
  const { push, node } = useToast();
  const load = useCallback(() => api<Conn[]>('/api/v1/connections').then(setData).catch((e: Error) => push(e.message, true)), [push]);
  useEffect(() => { setRole(currentRole()); load(); const t = setInterval(load, 10_000); return () => clearInterval(t); }, [load]);

  const canPoll = ['owner', 'admin', 'operator'].includes(role), canManage = ['owner', 'admin'].includes(role);
  const run = async (c: Conn, what: 'poll' | 'pause') => {
    setBusy(c.id + what);
    try {
      if (what === 'poll') { await api(`/api/v1/devices/${c.id}/poll`, { method: 'POST' }); push(`Checked ${c.name}`); }
      else { await api(`/api/v1/devices/${c.id}/pause`, { method: 'POST', body: JSON.stringify({ paused: !c.paused }) }); push(c.paused ? `Resumed ${c.name}` : `Paused ${c.name}`); }
      await load();
    } catch (e) { push((e as Error).message, true); } finally { setBusy(''); }
  };

  const { rows, sort } = useSort(data ?? [], { name: (c) => c.name, method: (c) => METHOD[c.mode] ?? 'Simulated', status: (c) => (c.paused ? 9 : RANK[c.status]), seen: (c) => (c.lastSeen ? new Date(c.lastSeen).getTime() : null), uptime: (c) => c.uptimeS }, { key: 'status', tie: 'name' });
  const down = (data ?? []).filter((c) => !c.paused && c.status === 'offline').length;

  return (
    <Shell live>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">Remote devices <span className="text-muted">({data?.length ?? 0})</span></h1>
        {canManage && <Link href="/devices/new" className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-on-accent">+ Add device</Link>}
      </div>
      <p className="mb-3 text-sm text-muted" role="status">{down > 0 ? <span className="text-crit">✖ {down} {down === 1 ? 'device is' : 'devices are'} not responding.</span> : '● Every active device is responding.'} Pulseboard checks each device every 30 seconds by default.</p>
      <div className="overflow-x-auto rounded-xl border border-line bg-surface">
        <table className="w-full min-w-[56rem] text-left text-sm">
          <thead className="text-muted"><tr><SortTh label="Device" k="name" sort={sort} /><SortTh label="Method" k="method" sort={sort} /><SortTh label="Status" k="status" sort={sort} /><SortTh label="Last check-in" k="seen" sort={sort} /><SortTh label="Uptime" k="uptime" sort={sort} /><th className="p-3 font-medium">Last error</th><th className="p-3"><span className="sr-only">Actions</span></th></tr></thead>
          <tbody>{rows.map((c) => (
            <tr key={c.id} className="border-t border-line align-top">
              <td className="p-3"><Link href={`/devices/${c.id}`} className="font-semibold text-accent hover:underline">{c.name}</Link><div className="text-muted">{c.type} · {c.address}</div></td>
              <td className="p-3">{METHOD[c.mode] ?? <span className="text-warn">◌ Simulated</span>}</td>
              <td className="p-3">{c.paused ? <span className="text-muted">⏸ Paused</span> : <StatusPill status={c.status} />}</td>
              <td className="p-3">{c.monitor === 'simulated' ? '–' : ago(c.lastSeen)}</td><td className="p-3">{uptime(c.uptimeS)}</td>
              <td className="max-w-xs p-3 text-crit">{c.lastError ? `✖ ${c.lastError}` : <span className="text-muted">–</span>}</td>
              <td className="p-3"><div className="flex flex-wrap justify-end gap-1">
                {canPoll && <button className={btn} disabled={c.monitor === 'simulated' || c.paused || busy === c.id + 'poll'} onClick={() => run(c, 'poll')}>{busy === c.id + 'poll' ? 'Checking…' : 'Check now'}</button>}
                {canManage && <button className={btn} disabled={c.monitor === 'simulated' || busy === c.id + 'pause'} onClick={() => run(c, 'pause')}>{c.paused ? 'Resume' : 'Pause'}</button>}
                {canManage && <Link href={`/devices/${c.id}/edit`} className={btn}>Edit</Link>}</div></td></tr>))}
            {data && data.length === 0 && <tr><td className="p-4 text-muted" colSpan={7}>No devices yet.</td></tr>}</tbody>
        </table>
      </div>
      {node}
    </Shell>
  );
}
