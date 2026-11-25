'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import StatusPill from '@/components/StatusPill';
import { useFleet } from '@/lib/api';
import { BORDER, isLive, RANK } from '@/lib/status';

export default function Noc() {
  const router = useRouter();
  const { devices, live } = useFleet();
  const [ready, setReady] = useState(false);
  const [now, setNow] = useState('');

  useEffect(() => { if (!localStorage.getItem('token')) router.replace('/login'); else setReady(true); }, [router]);
  useEffect(() => {
    const tick = () => setNow(new Date().toLocaleTimeString());
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') router.push('/'); };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [router]);

  if (!ready) return null;
  const sorted = [...devices].sort((a, b) => RANK[a.status] - RANK[b.status] || a.name.localeCompare(b.name));
  const count = (s: string) => devices.filter((d) => d.status === s).length;
  const online = devices.filter((d) => isLive(d.status));
  const score = online.length ? Math.round(online.reduce((a, d) => a + d.health, 0) / online.length) : 0;

  return (
    <main className="min-h-screen bg-bg p-6">
      <header className="mb-6 flex flex-wrap items-center gap-6">
        <h1 className="text-3xl font-bold">Operations centre</h1>
        <div className="flex flex-wrap gap-3 text-lg" role="status" aria-label="Fleet summary">
          <StatusPill status="critical" large /> <b>{count('critical')}</b>
          <StatusPill status="warning" large /> <b>{count('warning')}</b>
          <StatusPill status="offline" large /> <b>{count('offline')}</b>
          <StatusPill status="healthy" large /> <b>{count('healthy')}</b>
        </div>
        <div className="ml-auto flex items-center gap-4">
          <span className="text-lg text-muted">{live ? '● Live' : '○ Reconnecting…'}</span>
          <span className="text-3xl tabular-nums">{now}</span>
          <Link href="/" className="rounded-lg border border-line bg-raised px-4 py-2 hover:border-accent">Exit (Esc)</Link>
        </div>
      </header>
      <p className="mb-4 text-xl">Fleet health <b className="text-4xl">{score}%</b></p>
      <ul className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(260px,1fr))]">
        {sorted.map((d) => (
          <li key={d.id}>
            <Link href={`/devices/${d.id}`} className={`block rounded-2xl border-2 bg-surface p-5 ${BORDER[d.status]}`}>
              <div className="mb-2 flex items-center justify-between gap-2"><h2 className="text-2xl font-semibold">{d.name}</h2><StatusPill status={d.status} large /></div>
              <div className="text-5xl font-bold tabular-nums">{isLive(d.status) ? `${d.health}%` : '–'}</div>
              <div className="mt-2 text-muted">{!isLive(d.status) ? 'No data' : d.cpu === null ? `Latency ${d.latencyMs ?? '–'} ms` : `CPU ${d.cpu}% · RAM ${d.memory ?? '–'}% · Disk ${d.disk ?? '–'}%`}{d.monitor === 'simulated' && <span className="ml-2 text-warn">◌ simulated</span>}</div>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
