'use client';
import { PASSWORD_MIN } from '@pulse/shared';
import { useState } from 'react';
import { api } from '@/lib/api';
import { btnPri, card, input, label } from './ui';

export default function AccountTab({ toast }: { toast: (t: string, bad?: boolean) => void }) {
  const [f, setF] = useState({ current: '', next: '', again: '' });
  const [error, setError] = useState('');
  async function submit() {
    setError('');
    if (f.next !== f.again) return setError('The new passwords do not match.');
    try {
      const r = await api<{ token: string }>('/api/v1/auth/change-password', { method: 'POST', body: JSON.stringify({ current: f.current, next: f.next }) });
      localStorage.setItem('token', r.token);
      setF({ current: '', next: '', again: '' });
      toast('Password changed. Your other sessions were signed out.');
    } catch (e) { setError((e as Error).message); }
  }
  return (
    <form className={`${card} max-w-md space-y-3`} onSubmit={(e) => { e.preventDefault(); submit(); }}>
      <h2 className="text-lg font-semibold">Change your password</h2>
      <label className={label}>Current password<input className={`${input} mt-1`} type="password" autoComplete="current-password" value={f.current} onChange={(e) => setF({ ...f, current: e.target.value })} required /></label>
      <label className={label}>New password (at least {PASSWORD_MIN} characters)<input className={`${input} mt-1`} type="password" autoComplete="new-password" minLength={PASSWORD_MIN} value={f.next} onChange={(e) => setF({ ...f, next: e.target.value })} required /></label>
      <label className={label}>New password again<input className={`${input} mt-1`} type="password" autoComplete="new-password" value={f.again} onChange={(e) => setF({ ...f, again: e.target.value })} required /></label>
      {error && <p role="alert" className="text-sm text-crit">✖ {error}</p>}
      <button className={btnPri}>Change password</button>
    </form>
  );
}
