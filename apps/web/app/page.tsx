'use client';
import Link from 'next/link';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import HealthRing from '@/components/HealthRing';
import Shell from '@/components/Shell';
import StatusPill from '@/components/StatusPill';
import WidgetGrid, { type Widget } from '@/components/WidgetGrid';
import { useFleet } from '@/lib/api';
import { avg, isLive, pct, RANK } from '@/lib/status';

export default function Dashboard() {
  const { devices, history, live } = useFleet();
  const online = devices.filter((d) => isLive(d.status));
  const offline = devices.filter((d) => d.status === 'offline').length;
  const critical = devices.filter((d) => d.status === 'critical').length;
  const simulated = devices.filter((d) => d.monitor === 'simulated').length;
  const score = Math.round((avg(online.map((d) => d.health)) ?? 0) * (1 - (offline / Math.max(1, devices.length)) * 0.3));
  const issues = devices.filter((d) => d.status !== 'healthy').sort((a, b) => RANK[a.status] - RANK[b.status]).slice(0, 4);

  const card = (label: string, value: string, hot: 'warning' | 'critical' | null): Widget['node'] => (
    <div className={`h-full rounded-xl border bg-surface p-4 ${hot === 'critical' ? 'border-crit' : hot ? 'border-warn' : 'border-line'}`}>
      <div className="text-sm text-muted">{label}</div>
      <div className="text-2xl font-semibold">{value}</div>
      {hot && <StatusPill status={hot} />}
    </div>
  );
  const cpu = avg(online.map((d) => d.cpu)), mem = avg(online.map((d) => d.memory)), dsk = avg(online.map((d) => d.disk));
  const widgets: Widget[] = [
    { id: 'cpu', label: 'CPU usage', node: card('CPU usage', pct(cpu), cpu !== null && cpu > 80 ? 'warning' : null) },
    { id: 'ram', label: 'RAM usage', node: card('RAM usage', pct(mem), mem !== null && mem > 85 ? 'warning' : null) },
    { id: 'disk', label: 'Storage usage', node: card('Storage usage', pct(dsk), dsk !== null && dsk > 90 ? 'warning' : null) },
    { id: 'online', label: 'Devices online', node: card('Devices online', `${online.length} of ${devices.length}`, null) },
    { id: 'critical', label: 'Critical devices', node: card('Critical devices', String(critical), critical ? 'critical' : null) },
    { id: 'offline', label: 'Offline devices', node: card('Offline devices', String(offline), offline ? 'warning' : null) },
  ];

  return (
    <Shell live={live}>
      <h1 className="mb-4 text-xl font-semibold">Dashboard</h1>
      {simulated > 0 && (
        <p role="status" className="mb-3 rounded-lg border border-warn p-3 text-sm"><span className="text-warn">◌ Simulated data:</span> {simulated} {simulated === 1 ? 'device shows' : 'devices show'} made-up numbers, not real readings. Open a device and choose Edit to monitor it for real.</p>
      )}
      <section className="flex flex-wrap items-center gap-6 rounded-xl border border-line bg-surface p-4" aria-label="System health">
        <HealthRing score={devices.length ? score : 0} />
        <div className="min-w-60 flex-1">
          <h2 className="mb-2 text-sm font-semibold text-muted">Needs attention</h2>
          {issues.length === 0 ? <p>Everything is healthy.</p> : (
            <ul className="space-y-2">
              {issues.map((d) => (
                <li key={d.id}>
                  <Link href={`/devices/${d.id}`} className="flex items-center gap-3 rounded-lg bg-raised px-3 py-2 hover:outline hover:outline-1 hover:outline-accent">
                    <StatusPill status={d.status} /> <b>{d.name}</b>
                    <span className="ml-auto text-sm text-muted">CPU {d.cpu}% · RAM {d.memory}% · Disk {d.disk}%</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <div className="mb-2 mt-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-muted">Widgets</h2>
        <span className="text-xs text-muted">Drag to rearrange, or use the ◀ ▶ buttons</span>
      </div>
      <WidgetGrid widgets={widgets} storageKey="dashboard-widgets" />

      <section className="mt-3 rounded-xl border border-line bg-surface p-4" aria-label="Fleet CPU history">
        <h2 className="mb-2 text-sm font-semibold text-muted">Fleet CPU, last 5 minutes</h2>
        {history.length < 2 ? <p className="text-sm text-muted">Collecting data… the first points arrive within 5 seconds.</p> : (
          <div className="h-48" role="img" aria-label={`Average CPU is ${history.at(-1)?.cpu} percent`}>
            <ResponsiveContainer>
              <AreaChart data={history}>
                <CartesianGrid stroke="var(--border)" strokeDasharray="3 4" />
                <XAxis dataKey="t" stroke="var(--muted)" fontSize={11} minTickGap={40} />
                <YAxis domain={[0, 100]} stroke="var(--muted)" fontSize={11} unit="%" width={44} />
                <Tooltip contentStyle={{ background: 'var(--raised)', border: '1px solid var(--border)', color: 'var(--text)' }} />
                <Area type="monotone" dataKey="cpu" stroke="var(--accent)" fill="var(--accent)" fillOpacity={0.18} strokeWidth={2} isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>
    </Shell>
  );
}
