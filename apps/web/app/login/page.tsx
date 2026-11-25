'use client';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { api } from '@/lib/api';

export default function Login() {
  const router = useRouter();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError('');
    try {
      const res = await api<{ token: string; role: string }>('/api/v1/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: f.get('email'), password: f.get('password') }),
      });
      localStorage.setItem('token', res.token);
      localStorage.setItem('role', res.role); // used only to hide screens; the server enforces permissions
      router.replace('/');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const field = 'w-full rounded-lg border border-line bg-raised px-3 py-2';
  return (
    <main className="grid min-h-screen place-items-center p-4">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-xl border border-line bg-surface p-6">
        <h1 className="text-xl font-semibold">Sign in to Pulseboard</h1>
        <label className="block text-sm text-muted">Email
          <input name="email" type="email" required autoComplete="username" className={`${field} mt-1 text-ink`} />
        </label>
        <label className="block text-sm text-muted">Password
          <input name="password" type="password" required autoComplete="current-password" className={`${field} mt-1 text-ink`} />
        </label>
        {error && <p role="alert" className="text-sm text-crit">✖ {error}</p>}
        <button disabled={busy} className="w-full rounded-lg bg-accent px-3 py-2 font-medium text-on-accent disabled:opacity-60">
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </main>
  );
}
