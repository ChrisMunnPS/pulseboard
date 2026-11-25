'use client';
import type { Device, FleetTick } from '@pulse/shared';
import { useEffect, useState } from 'react';

const apiBase = () => `${location.protocol}//${location.hostname}:${process.env.NEXT_PUBLIC_API_PORT ?? '4000'}`;
const token = () => localStorage.getItem('token') ?? '';

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(apiBase() + path, {
    ...init,
    headers: { ...(init.body ? { 'content-type': 'application/json' } : {}), authorization: `Bearer ${token()}`, ...init.headers },
  });
  if (res.status === 401 && path !== '/api/v1/auth/login') {
    localStorage.removeItem('token');
    location.href = '/login';
  }
  if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? res.statusText);
  return res.json() as Promise<T>;
}

/** Devices plus a live feed over WebSocket (a new tick every 5 seconds). */
export function useFleet() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [history, setHistory] = useState<{ t: string; cpu: number }[]>([]);
  const [live, setLive] = useState(false);

  useEffect(() => {
    let ws: WebSocket | undefined;
    let stopped = false;
    api<Device[]>('/api/v1/devices').then(setDevices).catch(() => {});
    const open = async () => {
      let ticket: string;
      try {
        ticket = (await api<{ ticket: string }>('/api/v1/ws-ticket', { method: 'POST' })).ticket;
      } catch {
        if (!stopped) setTimeout(open, 3000);
        return;
      }
      if (stopped) return;
      ws = new WebSocket(`${apiBase().replace(/^http/, 'ws')}/ws/fleet?ticket=${encodeURIComponent(ticket)}`);
      ws.onopen = () => setLive(true);
      ws.onclose = () => { setLive(false); if (!stopped) setTimeout(open, 3000); };
      ws.onmessage = (e) => {
        const tick = JSON.parse(e.data) as FleetTick;
        setDevices((prev) => prev.map((d) => ({ ...d, ...(tick.devices.find((x) => x.id === d.id) ?? {}) })));
        const cpus = tick.devices.filter((d) => d.status !== 'offline' && d.status !== 'unknown' && d.cpu !== null).map((d) => d.cpu as number);
        if (cpus.length) setHistory((h) => [...h.slice(-59), { t: new Date(tick.at).toLocaleTimeString(), cpu: Math.round(cpus.reduce((a, b) => a + b, 0) / cpus.length) }]);
      };
    };
    open();
    return () => { stopped = true; ws?.close(); };
  }, []);

  return { devices, history, live };
}

export const currentRole = () => (typeof localStorage === 'undefined' ? '' : localStorage.getItem('role') ?? '');

/** Downloads an authenticated file (the sign-in token travels in a header, not in a link). */
export async function download(path: string, filename: string): Promise<void> {
  const res = await fetch(apiBase() + path, { headers: { authorization: `Bearer ${token()}` } });
  if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? res.statusText);
  const url = URL.createObjectURL(await res.blob());
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  a.click();
  URL.revokeObjectURL(url);
}
