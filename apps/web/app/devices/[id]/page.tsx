'use client';
import type { DeviceDetail } from '@pulse/shared';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import Bar from '@/components/Bar';
import ConfirmDialog from '@/components/ConfirmDialog';
import Shell from '@/components/Shell';
import SourceBadge from '@/components/SourceBadge';
import StatusPill from '@/components/StatusPill';
import { api } from '@/lib/api';
import { SortTh, useSort } from '@/lib/sort';
import { fmtBytes, isLive, pct, rate, uptime } from '@/lib/status';
import { useToast } from '@/lib/toast';

const card = 'rounded-xl border border-line bg-surface p-4';
const btn = 'rounded-lg border border-line bg-raised px-3 py-1.5 text-sm hover:border-accent disabled:cursor-not-allowed disabled:opacity-40';
const h2 = 'mb-2 text-sm font-semibold text-muted';
type Pt = { t: string; cpu: number | null; mem: number | null };
const SVC_ORDER = { Failed: 0, Stopped: 1, Running: 2 } as const;
// Container and virtual-switch ports hide behind a toggle so the real ports stand out
const VIRTUAL_IF = /^(docker|veth|br-|virbr|sit\d|ovs-system|tun\d*|tap\d*|dummy|ifb)/i;

function Trend({ data, keyName, label }: { data: Pt[]; keyName: 'cpu' | 'mem'; label: string }) {
  if (data.every((p) => p[keyName] === null)) return <p className="text-sm text-muted">Not reported by this device.</p>;
  if (data.length < 2) return <p className="text-sm text-muted">Collecting data…</p>;
  return (
    <div className="h-40" role="img" aria-label={`${label} is ${data.at(-1)?.[keyName]} percent`}>
      <ResponsiveContainer>
        <AreaChart data={data}>
          <CartesianGrid stroke="var(--border)" strokeDasharray="3 4" />
          <XAxis dataKey="t" stroke="var(--muted)" fontSize={11} minTickGap={40} />
          <YAxis domain={[0, 100]} stroke="var(--muted)" fontSize={11} unit="%" width={44} />
          <Tooltip contentStyle={{ background: 'var(--raised)', border: '1px solid var(--border)', color: 'var(--text)' }} />
          <Area type="monotone" dataKey={keyName} stroke="var(--accent)" fill="var(--accent)" fillOpacity={0.18} strokeWidth={2} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export default function DeviceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [d, setD] = useState<DeviceDetail | null>(null);
  const [hist, setHist] = useState<Pt[]>([]);
  const [query, setQuery] = useState('');
  const [showVirtual, setShowVirtual] = useState(false);
  const [error, setError] = useState('');
  const [confirm, setConfirm] = useState<{ title: string; body: string; label: string; run: () => void } | null>(null);
  const { push, node } = useToast();
  const ifaceRows = (d?.interfaces ?? []).filter((i) => showVirtual || !VIRTUAL_IF.test(i.name));
  const { rows: ifaces, sort: ifSort } = useSort(ifaceRows, { name: (i) => i.name, up: (i) => (i.up === null ? null : i.up ? 0 : 1), speed: (i) => i.speedMbps, inBps: (i) => i.inBps, outBps: (i) => i.outBps }, { key: 'up', tie: 'name' });
  const { rows: svcs, sort: svcSort } = useSort(d?.services ?? [], { name: (x) => x.display ?? x.name, state: (x) => SVC_ORDER[x.state], start: (x) => x.startType }, { key: 'state', tie: 'name' });
  const procRows = (d?.processes ?? []).filter((p) => p.name.toLowerCase().includes(query.toLowerCase()));
  const { rows: procs, sort: procSort } = useSort(procRows, { name: (p) => p.name, cpu: (p) => p.cpu, ram: (p) => p.memGb }, { key: 'ram', dir: 'desc' });

  const load = useCallback(async () => {
    try {
      const x = await api<DeviceDetail>(`/api/v1/devices/${id}`);
      setD(x); setError('');
      setHist((h) => [...h.slice(-59), { t: new Date().toLocaleTimeString(), cpu: x.cpu, mem: x.memory }]);
    } catch (e) { setError((e as Error).message); }
  }, [id]);
  useEffect(() => { load(); const t = setInterval(load, 5000); return () => clearInterval(t); }, [load]);

  const act = async (path: string, done: string) => {
    try { await api(path, { method: 'POST' }); push(done); load(); } catch (e) { push((e as Error).message, true); }
  };
  const power = (action: 'reboot' | 'shutdown', verb: string) =>
    setConfirm({ title: `${verb} ${d?.name}?`, body: `This will ${verb.toLowerCase()} ${d?.name} and interrupt anyone using it. The action is recorded in the audit log. (Simulated: no real machine is contacted.)`, label: verb,
      run: () => act(`/api/v1/devices/${id}/actions/${action}`, `${verb} sent to ${d?.name} (simulated)`) });
  const remove = () => setConfirm({ title: `Delete ${d?.name}?`, body: 'The device and its alerts are removed from Pulseboard. The device itself is not touched.', label: 'Delete device',
    run: async () => { try { await api(`/api/v1/devices/${id}`, { method: 'DELETE' }); router.push('/devices'); } catch (e) { push((e as Error).message, true); } } });

  if (error && !d) return <Shell live><p role="alert" className="text-crit">✖ {error}</p><Link href="/devices" className="text-accent underline">Back to devices</Link></Shell>;
  if (!d) return <Shell live><p className="text-muted">Loading…</p></Shell>;

  const sim = d.monitor === 'simulated';
  const live = isLive(d.status);
  const m = d.monitorInfo, inv = d.inventory;
  const failed = d.services.filter((s) => s.state === 'Failed').length;
  const realIf = d.interfaces.filter((i) => !VIRTUAL_IF.test(i.name));
  const hiddenIf = d.interfaces.length - realIf.length;
  const n = (v: number | null, unit = '') => (v === null ? '–' : `${v}${unit}`);

  return (
    <Shell live>
      <nav aria-label="Breadcrumb" className="mb-2 text-sm"><Link href="/devices" className="text-accent hover:underline">Devices</Link> <span className="text-muted">/ {d.name}</span></nav>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex flex-wrap items-center gap-3 text-xl font-semibold">{d.name} <StatusPill status={d.status} /> <SourceBadge monitor={d.monitor} /></h1>
          <p className="text-sm text-muted">{d.type} · {d.os} · {d.address}{m.uptimeS !== null && ` · up ${uptime(m.uptimeS)}`}{m.lastSeen && ` · last check ${new Date(m.lastSeen).toLocaleTimeString()}`}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/devices/${id}/edit`} className={btn}>Edit</Link>
          {sim && <>
            <button className={`${btn} !border-crit !text-crit`} onClick={() => power('reboot', 'Reboot')}>Reboot</button>
            <button className={`${btn} !border-crit !text-crit`} onClick={() => power('shutdown', 'Shutdown')}>Shutdown</button>
            <button className={btn} onClick={() => act(`/api/v1/devices/${id}/actions/wake`, `Wake-on-LAN sent to ${d.name} (simulated)`)}>Wake-on-LAN</button></>}
          <button className={`${btn} !border-crit !text-crit`} onClick={remove}>Delete</button>
        </div>
      </div>

      {sim && <p className="mb-3 rounded-lg border border-warn p-3 text-sm" role="status"><span className="text-warn">◌ Simulated data.</span> These numbers are made up. Choose Edit to monitor this device for real.</p>}
      {!sim && m.lastError && <p className="mb-3 rounded-lg border border-crit p-3 text-sm text-crit" role="alert">✖ Last check failed: {m.lastError}</p>}
      {!sim && <p className="mb-3 text-sm text-muted">Remote actions (reboot, kill process, restart service) are not available on monitored devices yet.</p>}

      <div className="mb-3 grid grid-cols-2 gap-3 md:grid-cols-5">
        {[['Health', live ? `${d.health}%` : '–'], ['CPU', pct(d.cpu)], ['Memory', pct(d.memory)], ['Storage', pct(d.disk)], ...(d.temperatureC !== null ? [['Temperature', `${d.temperatureC} °C`]] : []), ['Latency', n(d.latencyMs === null ? null : Math.round(d.latencyMs * 10) / 10, ' ms')]].map(([k, v]) => (
          <div key={k} className={card}><div className="text-sm text-muted">{k}</div><div className="text-2xl font-semibold">{v}</div></div>
        ))}
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        {(sim || d.cpu !== null) && <section className={card} aria-label="CPU"><h2 className={h2}>CPU</h2><Trend data={hist} keyName="cpu" label="CPU" />
          <div className="mt-2 space-y-1">{d.cores.map((c, i) => <div key={i} className="flex items-center gap-2"><span className="w-14 text-sm text-muted">Core {i}</span><div className="flex-1"><Bar value={c} label={`Core ${i}`} /></div></div>)}</div></section>}
        {(sim || d.memory !== null) && <section className={card} aria-label="Memory"><h2 className={h2}>Memory</h2><Trend data={hist} keyName="mem" label="Memory" />
          <p className="mt-2 text-sm text-muted">{n(d.memory, '%')} used</p></section>}

        {inv && (
          <section className={card} aria-label="Hardware"><h2 className={h2}>Hardware</h2>
            <dl className="grid grid-cols-[9rem_1fr] gap-y-1 text-sm">
              {([['CPU', inv.cpuModel ? `${inv.cpuModel}${inv.cpuCount && inv.cpuCount > 1 ? ` (×${inv.cpuCount})` : ''}` : null], ['Memory', inv.ramTotalGb ? `${inv.ramTotalGb} GB total${inv.ramModules.length ? ` in ${inv.ramModules.length} module${inv.ramModules.length > 1 ? 's' : ''}` : ''}` : null], ['Memory speed', [...new Set(inv.ramModules.map((m) => m.speedMhz).filter(Boolean))].map((v) => `${v} MHz`).join(', ') || null], ['Memory type', [...new Set(inv.ramModules.map((m) => m.type).filter(Boolean))].join(', ') || null], ['Manufacturer', inv.manufacturer], ['Model', inv.model], ['Serial number', inv.serial], ['Firmware / version', inv.firmware], ['Operating system', inv.osName ? `${inv.osName}${inv.osBuild ? ` (${inv.osBuild})` : ''}` : null], ['BIOS', inv.biosVersion ? `${inv.biosVersion}${inv.biosDate ? `, ${inv.biosDate}` : ''}` : null], ['Motherboard', inv.boardModel ? `${inv.boardManufacturer ?? ''} ${inv.boardModel}`.trim() : null], ['Board serial', inv.boardSerial], ['Graphics', inv.gpus.length ? inv.gpus.map((g) => g.name).join(', ') : null], ['Temperature', inv.temperatureC === null ? null : `${inv.temperatureC} °C`], ['Hostname', inv.hostname], ['Location', inv.location], ['Contact', inv.contact]] as [string, string | null][]).filter(([k, v]) => !(d.monitor === 'ssh' && (k === 'Location' || k === 'Contact')) && !(v === null && ['Memory speed', 'Memory type', 'Operating system', 'BIOS', 'Motherboard', 'Board serial', 'Graphics'].includes(k))).map(([k, v]) => (
                <div key={k} className="contents"><dt className="text-muted">{k}</dt><dd className="break-words">{v ?? <span className="text-muted">Not reported</span>}</dd></div>))}
              <dt className="text-muted">Drives</dt><dd>{inv.disks.length ? <ul>{inv.disks.map((x, i) => <li key={i}>{x.model}{x.sizeBytes ? ` · ${fmtBytes(x.sizeBytes)}` : ''}{x.detail ? ` (${x.detail})` : ''}{x.serial ? <span className="text-muted"> · S/N {x.serial}</span> : null}</li>)}</ul> : <span className="text-muted">Not reported</span>}</dd>
              {inv.description && <><dt className="text-muted">Description</dt><dd className="break-words text-muted">{inv.description}</dd></>}
            </dl>
            {d.monitor === 'snmp' && <p className="mt-3 rounded-lg bg-raised p-2 text-xs text-muted">ℹ Over SNMP a device can only report what its SNMP software exposes. RAM modules, memory speed, BIOS and motherboard details come from the machine&apos;s hardware table, which SNMP cannot read. Monitor a computer over SSH to see them.</p>}
          </section>)}

        {inv && inv.ramModules.length > 0 && (
          <section className={`${card} overflow-x-auto lg:col-span-2`} aria-label="Memory modules"><h2 className={h2}>Memory modules ({inv.ramModules.length})</h2>
            <table className="w-full min-w-[40rem] text-left text-sm"><thead className="text-muted"><tr>{['Slot', 'Size', 'Speed', 'Type', 'Manufacturer', 'Part number', 'Serial'].map((h) => <th key={h} className="p-2 font-medium">{h}</th>)}</tr></thead>
              <tbody>{inv.ramModules.map((m, i) => <tr key={i} className="border-t border-line"><td className="p-2">{m.slot ?? '–'}</td><td className="p-2">{fmtBytes(m.sizeBytes)}</td><td className="p-2">{m.speedMhz ? `${m.speedMhz} MHz` : '–'}</td><td className="p-2">{m.type ?? '–'}</td><td className="p-2">{m.manufacturer ?? '–'}</td><td className="p-2">{m.partNumber ?? '–'}</td><td className="p-2 text-muted">{m.serial ?? '–'}</td></tr>)}</tbody></table></section>)}
        {inv && inv.apps.length > 0 && (
          <section className={`${card} lg:col-span-2`} aria-label="Installed applications"><details><summary className="cursor-pointer text-sm font-semibold text-muted">Installed applications ({inv.apps.length})</summary>
            <ul className="mt-2 grid max-h-72 gap-x-6 gap-y-1 overflow-y-auto text-sm md:grid-cols-2">{inv.apps.map((a, i) => <li key={i} className="flex justify-between gap-2"><span className="truncate">{a.name}</span><span className="shrink-0 text-muted">{a.version ?? ''}</span></li>)}</ul></details></section>)}

        {d.volumes.length > 0 && <section className={card} aria-label="Storage"><h2 className={h2}>Storage</h2>
          {d.volumes.map((v) => (
            <div key={v.mount} className="mb-3"><div className="mb-1 flex justify-between gap-2 text-sm"><b className="break-all">{v.mount}</b><span className="flex shrink-0 items-center gap-2"><span className="text-muted">{fmtBytes(v.sizeBytes)}</span>{v.smart !== null && <>SMART {v.smart === 'OK' ? <StatusPill status="healthy" /> : <StatusPill status="warning" />}</>}{v.lifePct !== null && ` · ${v.lifePct}% life left`}</span></div><Bar value={v.usedPct} warn={80} crit={92} label={`${v.mount} used`} /></div>))}
          {d.drives.length > 0 && <div className="mt-3 border-t border-line pt-3"><h3 className="mb-1 text-sm font-semibold text-muted">Drives</h3>
            <ul className="space-y-1 text-sm">{d.drives.map((x, i) => <li key={i} className="flex flex-wrap items-center justify-between gap-2"><span>{x.model}</span>
              <span className="flex items-center gap-3">{x.tempC !== null && <span className="text-muted">{x.tempC} °C</span>}{x.status && <span className={x.ok === false ? 'text-crit' : 'text-ok'}>{x.ok === false ? '✖' : '●'} {x.status}</span>}</span></li>)}</ul></div>}</section>}

        <section className={card} aria-label="Network"><h2 className={h2}>Network</h2>
          <dl className="grid grid-cols-2 gap-2 text-sm">
            {[['Latency', n(d.network.latencyMs === null ? null : Math.round(d.network.latencyMs * 10) / 10, ' ms')], ['Jitter', n(d.network.jitterMs, ' ms')], ['Packet loss', n(d.network.lossPct, '%')], ...(sim ? [['Download', n(d.network.downMbps, ' Mb/s')], ['Upload', n(d.network.upMbps, ' Mb/s')]] : [])].map(([k, v]) => (
              <div key={k}><dt className="text-muted">{k}</dt><dd className="text-lg font-semibold">{v}</dd></div>))}
          </dl></section>

        {d.interfaces.length > 0 && <section className={`${card} overflow-x-auto lg:col-span-2`} aria-label="Interfaces"><div className="mb-2 flex items-center justify-between"><h2 className="text-sm font-semibold text-muted">Network ports ({ifaces.length}{hiddenIf > 0 && !showVirtual ? `, ${hiddenIf} virtual hidden` : ''})</h2>{hiddenIf > 0 && <button className={btn} aria-pressed={showVirtual} onClick={() => setShowVirtual(!showVirtual)}>{showVirtual ? 'Hide virtual ports' : `Show virtual ports (${hiddenIf})`}</button>}</div>
          <table className="w-full min-w-[34rem] text-left text-sm"><thead className="text-muted"><tr><SortTh label="Port" k="name" sort={ifSort} /><SortTh label="Status" k="up" sort={ifSort} /><SortTh label="Speed" k="speed" sort={ifSort} /><SortTh label="In" k="inBps" sort={ifSort} /><SortTh label="Out" k="outBps" sort={ifSort} /></tr></thead>
            <tbody>{ifaces.map((i) => (
              <tr key={i.index} className="border-t border-line"><td className="p-2"><b>{i.name}</b>{i.alias && <span className="text-muted"> · {i.alias}</span>}</td>
                <td className="p-2">{i.up === null ? '–' : i.up ? <span className="text-ok">● Up</span> : <span className="text-muted">○ Down</span>}</td>
                <td className="p-2">{i.speedMbps ? `${i.speedMbps} Mb/s` : '–'}</td><td className="p-2">{rate(i.inBps)}</td><td className="p-2">{rate(i.outBps)}</td></tr>))}</tbody></table></section>}

        {d.processes.length > 0 && <section className={`${card} overflow-x-auto`} aria-label="Processes"><h2 className={h2}>Processes</h2>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search processes" aria-label="Search processes" className="mb-2 w-full rounded-lg border border-line bg-raised px-3 py-1.5" />
          <table className="w-full text-left text-sm"><thead className="text-muted"><tr><SortTh label="Name" k="name" sort={procSort} /><SortTh label="CPU" k="cpu" sort={procSort} /><SortTh label="RAM" k="ram" sort={procSort} />{sim && <th className="p-2"><span className="sr-only">Actions</span></th>}</tr></thead>
            <tbody>{procs.map((p) => (
              <tr key={p.pid} className="border-t border-line"><td className="p-2">{p.name} <span className="text-muted">({p.pid})</span></td><td className="p-2">{p.cpu === null ? '–' : `${p.cpu}%`}</td><td className="p-2">{p.memGb} GB</td>
                {sim && <td className="p-2 text-right"><button className={`${btn} !border-crit !text-crit`} aria-label={`Kill ${p.name}`}
                  onClick={() => setConfirm({ title: `Kill ${p.name}?`, body: `Process ${p.pid} on ${d.name} will be stopped immediately. (Simulated.)`, label: 'Kill process', run: () => act(`/api/v1/devices/${id}/processes/${p.pid}/kill`, `${p.name} stopped (simulated)`) })}>Kill</button></td>}</tr>))}
              {procs.length === 0 && <tr><td className="p-2 text-muted" colSpan={4}>No processes match.</td></tr>}</tbody></table>
          {!sim && <p className="mt-2 text-xs text-muted">Top processes by memory. SNMP has no instant CPU figure per process.</p>}</section>}

        {d.services.length > 0 && <section className={`${card} overflow-x-auto`} aria-label="Services"><h2 className={h2}>Services ({d.services.length}) {failed > 0 && <StatusPill status="critical" />}</h2>
          <div className="max-h-96 overflow-y-auto"><table className="w-full text-left text-sm"><thead className="text-muted"><tr><SortTh label="Service" k="name" sort={svcSort} /><SortTh label="State" k="state" sort={svcSort} />{!sim && <SortTh label="Starts" k="start" sort={svcSort} />}{sim && <th className="p-3"><span className="sr-only">Actions</span></th>}</tr></thead>
            <tbody>{svcs.map((s) => (
              <tr key={s.name} className="border-t border-line"><td className="p-3">{s.display ?? s.name}</td>
                <td className="p-3">{s.state === 'Failed' ? <span className="text-crit">✖ Failed</span> : s.state === 'Running' ? <span className="text-ok">● Running</span> : <span className="text-muted">○ Stopped</span>}</td>
                {!sim && <td className="p-3 text-muted">{s.startType ?? '–'}</td>}
                {sim && <td className="flex flex-wrap justify-end gap-1 p-3">{(['start', 'stop', 'restart'] as const).map((a) => (
                  <button key={a} className={btn} disabled={(a === 'start' && s.state === 'Running') || (a === 'stop' && s.state !== 'Running')} aria-label={`${a} ${s.name}`}
                    onClick={() => act(`/api/v1/devices/${id}/services/${encodeURIComponent(s.name)}/${a}`, `${s.name}: ${a} done (simulated)`)}>{a[0].toUpperCase() + a.slice(1)}</button>))}</td>}</tr>))}</tbody></table></div></section>}
      </div>

      {confirm && <ConfirmDialog title={confirm.title} body={confirm.body} confirmLabel={confirm.label} onCancel={() => setConfirm(null)} onConfirm={() => { const run = confirm.run; setConfirm(null); run(); }} />}
      {node}
    </Shell>
  );
}
