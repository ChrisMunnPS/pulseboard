'use client';
import { PASSWORD_MIN, ROLES, type Role, type UserRow } from '@pulse/shared';
import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { btn, btnPri, card, input, label } from './ui';

export default function UsersTab({ toast }: { toast: (t: string, bad?: boolean) => void }) {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [nu, setNu] = useState({ email: '', role: 'viewer' as Role, password: '' });
  const [error, setError] = useState('');
  const [reset, setReset] = useState<{ id: string; password: string } | null>(null);
  const load = useCallback(() => api<UserRow[]>('/api/v1/users').then(setUsers).catch((e: Error) => toast(e.message, true)), [toast]);
  useEffect(() => { load(); }, [load]);

  const patch = async (u: UserRow, body: object, done: string) => {
    try { await api(`/api/v1/users/${u.id}`, { method: 'PATCH', body: JSON.stringify(body) }); toast(done); load(); } catch (e) { toast((e as Error).message, true); load(); }
  };
  async function add() {
    setError('');
    try { await api('/api/v1/users', { method: 'POST', body: JSON.stringify(nu) }); setNu({ email: '', role: 'viewer', password: '' }); toast('User added'); load(); } catch (e) { setError((e as Error).message); }
  }

  return (
    <div className="space-y-3">
      <form className={`${card} grid gap-3 md:grid-cols-4`} onSubmit={(e) => { e.preventDefault(); add(); }}>
        <h2 className="text-lg font-semibold md:col-span-4">Add user</h2>
        <label className={label}>Email<input className={`${input} mt-1`} type="email" value={nu.email} onChange={(e) => setNu({ ...nu, email: e.target.value })} required /></label>
        <label className={label}>Role<select className={`${input} mt-1`} value={nu.role} onChange={(e) => setNu({ ...nu, role: e.target.value as Role })}>{ROLES.map((r) => <option key={r}>{r}</option>)}</select></label>
        <label className={`${label} md:col-span-2`}>Starting password (at least {PASSWORD_MIN} characters)<input className={`${input} mt-1`} type="password" value={nu.password} onChange={(e) => setNu({ ...nu, password: e.target.value })} minLength={PASSWORD_MIN} autoComplete="new-password" required /></label>
        {error && <p role="alert" className="text-sm text-crit md:col-span-4">✖ {error}</p>}
        <div className="md:col-span-4"><button className={btnPri}>Add user</button></div>
      </form>

      <div className={`${card} overflow-x-auto`}>
        <table className="w-full min-w-[36rem] text-left text-sm">
          <thead className="text-muted"><tr><th className="p-2">User</th><th className="p-2">Role</th><th className="p-2">Status</th><th className="p-2"><span className="sr-only">Actions</span></th></tr></thead>
          <tbody>{users.map((u) => (
            <tr key={u.id} className="border-t border-line align-top">
              <td className="p-2">{u.email}</td>
              <td className="p-2"><select className={`${input} w-32`} value={u.role} aria-label={`Role for ${u.email}`} onChange={(e) => patch(u, { role: e.target.value }, `${u.email} is now ${e.target.value}`)}>{ROLES.map((r) => <option key={r}>{r}</option>)}</select></td>
              <td className="p-2">{u.disabled ? '○ Disabled' : '● Active'}</td>
              <td className="space-x-2 p-2 text-right">
                <button className={btn} onClick={() => patch(u, { disabled: !u.disabled }, u.disabled ? 'User enabled' : 'User disabled and signed out')}>{u.disabled ? 'Enable' : 'Disable'}</button>
                {reset?.id === u.id ? (
                  <span className="inline-flex gap-1">
                    <input className={`${input} w-44`} type="password" autoComplete="new-password" placeholder={`New password (${PASSWORD_MIN}+)`} aria-label={`New password for ${u.email}`} value={reset.password} onChange={(e) => setReset({ id: u.id, password: e.target.value })} />
                    <button className={btnPri} onClick={() => { const p = reset.password; setReset(null); patch(u, { password: p }, 'Password reset. Their other sessions were signed out.'); }}>Set</button>
                  </span>
                ) : <button className={btn} onClick={() => setReset({ id: u.id, password: '' })}>Reset password</button>}
              </td>
            </tr>))}</tbody>
        </table>
        <p className="mt-3 text-xs text-muted">Users are disabled rather than deleted so the audit log stays meaningful. There must always be at least one active owner.</p>
      </div>
    </div>
  );
}
