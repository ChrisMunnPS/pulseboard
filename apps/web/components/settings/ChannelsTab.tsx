'use client';
import type { Channel, ChannelType, Severity } from '@pulse/shared';
import { useCallback, useEffect, useState } from 'react';
import ConfirmDialog from '@/components/ConfirmDialog';
import { api } from '@/lib/api';
import { btn, btnDng, btnPri, card, input, label, SEVERITIES } from './ui';

const TYPES: [ChannelType, string][] = [['email', 'Email (SMTP)'], ['teams', 'Microsoft Teams'], ['slack', 'Slack'], ['discord', 'Discord'], ['webhook', 'Webhook']];
interface Form { id?: string; type: ChannelType; name: string; enabled: boolean; minSeverity: Severity; secret: string; host: string; port: string; secure: boolean; user: string; from: string; to: string }
const blank = (): Form => ({ type: 'teams', name: '', enabled: true, minSeverity: 'warning', secret: '', host: '', port: '587', secure: false, user: '', from: '', to: '' });

export default function ChannelsTab({ toast }: { toast: (t: string, bad?: boolean) => void }) {
  const [list, setList] = useState<Channel[]>([]);
  const [form, setForm] = useState<Form | null>(null);
  const [error, setError] = useState('');
  const [del, setDel] = useState<Channel | null>(null);
  const [busy, setBusy] = useState('');
  const load = useCallback(() => api<Channel[]>('/api/v1/channels').then(setList).catch((e: Error) => toast(e.message, true)), [toast]);
  useEffect(() => { load(); }, [load]);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => (f ? { ...f, [k]: v } : f));

  const edit = (c: Channel) => setForm({ ...blank(), id: c.id, type: c.type, name: c.name, enabled: c.enabled, minSeverity: c.minSeverity,
    host: String(c.config.host ?? ''), port: String(c.config.port ?? '587'), secure: Boolean(c.config.secure), user: String(c.config.user ?? ''), from: String(c.config.from ?? ''), to: String(c.config.to ?? '') });

  async function save() {
    if (!form) return;
    setError('');
    const body = { type: form.type, name: form.name, enabled: form.enabled, minSeverity: form.minSeverity,
      config: form.type === 'email' ? { host: form.host, port: Number(form.port), secure: form.secure, user: form.user, from: form.from, to: form.to } : {},
      ...(form.secret ? { secret: form.secret } : {}) };
    try {
      await api(form.id ? `/api/v1/channels/${form.id}` : '/api/v1/channels', { method: form.id ? 'PUT' : 'POST', body: JSON.stringify(body) });
      setForm(null); toast('Channel saved'); load();
    } catch (e) { setError((e as Error).message); }
  }
  async function test(c: Channel) {
    setBusy(c.id);
    try { await api(`/api/v1/channels/${c.id}/test`, { method: 'POST' }); toast(`Test sent to ${c.name}`); } catch (e) { toast((e as Error).message, true); } finally { setBusy(''); }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted">Webhook URLs and the SMTP password are encrypted before they are stored and are never shown again. Push notifications are not available yet.</p>
        {!form && <button className={btnPri} onClick={() => { setError(''); setForm(blank()); }}>+ Add channel</button>}
      </div>

      {form && (
        <form className={`${card} grid gap-3 md:grid-cols-2`} onSubmit={(e) => { e.preventDefault(); save(); }}>
          <h2 className="text-lg font-semibold md:col-span-2">{form.id ? 'Edit channel' : 'Add channel'}</h2>
          <label className={label}>Type<select className={`${input} mt-1`} value={form.type} disabled={!!form.id} onChange={(e) => set('type', e.target.value as ChannelType)}>{TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
          <label className={label}>Name<input className={`${input} mt-1`} value={form.name} onChange={(e) => set('name', e.target.value)} required maxLength={60} /></label>
          <label className={label}>Send alerts of this severity or higher<select className={`${input} mt-1`} value={form.minSeverity} onChange={(e) => set('minSeverity', e.target.value as Severity)}>{[...SEVERITIES].reverse().map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
          <label className="flex items-center gap-2 self-end text-sm"><input type="checkbox" checked={form.enabled} onChange={(e) => set('enabled', e.target.checked)} /> Enabled</label>
          {form.type === 'email' ? (
            <>
              <label className={label}>SMTP server<input className={`${input} mt-1`} value={form.host} onChange={(e) => set('host', e.target.value)} required placeholder="smtp.example.com" /></label>
              <label className={label}>Port<input className={`${input} mt-1`} type="number" value={form.port} onChange={(e) => set('port', e.target.value)} required /></label>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.secure} onChange={(e) => set('secure', e.target.checked)} /> Use TLS from the start (usually port 465)</label>
              <label className={label}>SMTP username (optional)<input className={`${input} mt-1`} value={form.user} onChange={(e) => set('user', e.target.value)} autoComplete="off" /></label>
              <label className={label}>SMTP password<input className={`${input} mt-1`} type="password" value={form.secret} onChange={(e) => set('secret', e.target.value)} autoComplete="new-password" placeholder={form.id ? 'Leave blank to keep the saved one' : ''} /></label>
              <label className={label}>From address<input className={`${input} mt-1`} type="email" value={form.from} onChange={(e) => set('from', e.target.value)} required /></label>
              <label className={`${label} md:col-span-2`}>Send to (comma-separated, up to 10)<input className={`${input} mt-1`} value={form.to} onChange={(e) => set('to', e.target.value)} required /></label>
              <p className="rounded-lg bg-raised p-2 text-xs text-muted md:col-span-2">ℹ When you set a username, the password is only ever sent over an encrypted connection.</p>
            </>
          ) : (
            <label className={`${label} md:col-span-2`}>{form.type === 'webhook' ? 'Webhook URL' : 'Incoming webhook URL'}
              <input className={`${input} mt-1`} type="password" value={form.secret} onChange={(e) => set('secret', e.target.value)} autoComplete="off" required={!form.id} placeholder={form.id ? 'Leave blank to keep the saved URL' : 'https://…'} />
              <span className="text-xs">{form.type === 'webhook' ? 'http:// or https://. Loopback and link-local addresses are blocked.' : 'Must start with https://. Loopback and link-local addresses are blocked.'}</span></label>
          )}
          {error && <p role="alert" className="text-sm text-crit md:col-span-2">✖ {error}</p>}
          <div className="flex gap-2 md:col-span-2"><button type="submit" className={btnPri}>Save channel</button><button type="button" className={btn} onClick={() => setForm(null)}>Cancel</button></div>
        </form>
      )}

      <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
        {list.length === 0 && <li className="p-4 text-muted">No channels yet. Add one to receive alerts outside Pulseboard.</li>}
        {list.map((c) => (
          <li key={c.id} className="flex flex-wrap items-center gap-3 p-4">
            <div className="min-w-48 flex-1">
              <b>{c.name}</b> <span className="text-sm text-muted">{TYPES.find((t) => t[0] === c.type)?.[1]}</span>
              <div className="text-sm text-muted">{c.enabled ? '● Enabled' : '○ Disabled'} · {c.minSeverity} and above{c.secretHint ? ` · ${c.secretHint}` : ''}</div>
            </div>
            <button className={btn} disabled={busy === c.id} onClick={() => test(c)}>{busy === c.id ? 'Sending…' : 'Send test'}</button>
            <button className={btn} onClick={() => { setError(''); edit(c); }}>Edit</button>
            <button className={btnDng} onClick={() => setDel(c)}>Delete</button>
          </li>
        ))}
      </ul>
      {del && <ConfirmDialog title={`Delete ${del.name}?`} body="Alerts will stop going to this channel. The saved secret is deleted." confirmLabel="Delete channel" onCancel={() => setDel(null)}
        onConfirm={async () => { const c = del; setDel(null); try { await api(`/api/v1/channels/${c.id}`, { method: 'DELETE' }); toast('Channel deleted'); load(); } catch (e) { toast((e as Error).message, true); } }} />}
    </div>
  );
}
