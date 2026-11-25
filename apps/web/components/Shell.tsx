'use client';
import { MotionConfig } from 'framer-motion';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';

const NAV: [href: string, label: string, ready: boolean][] = [
  ['/', 'Dashboard', true], ['/devices', 'Devices', true], ['/alerts', 'Alerts', true],
  ['#', 'Performance', false], ['#', 'Storage', false], ['#', 'Network', false], ['#', 'Services', false],
  ['#', 'Processes', false], ['#', 'Remote Devices', false], ['#', 'Reports', false], ['/settings', 'Settings', true],
];

// Picks black or white text for readability on the chosen accent colour.
const onAccent = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  const lum = (((n >> 16) & 255) * 299 + ((n >> 8) & 255) * 587 + (n & 255) * 114) / 1000;
  return lum > 150 ? '#000000' : '#ffffff';
};

export default function Shell({ children, live }: { children: ReactNode; live?: boolean }) {
  const path = usePathname();
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem('token')) router.replace('/login');
    else setReady(true);
  }, [router]);

  if (!ready) return null;

  const toggleTheme = () => {
    const root = document.documentElement;
    const next = root.dataset.theme === 'light' ? 'dark' : 'light';
    root.dataset.theme = next;
    localStorage.setItem('theme', next);
  };
  const setAccent = (hex: string) => {
    const root = document.documentElement.style;
    root.setProperty('--accent', hex);
    root.setProperty('--on-accent', onAccent(hex));
    localStorage.setItem('accent', hex);
    localStorage.setItem('onAccent', onAccent(hex));
  };
  const signOut = () => { localStorage.removeItem('token'); localStorage.removeItem('role'); router.replace('/login'); };

  return (
    <MotionConfig reducedMotion="user">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-accent focus:p-2 focus:text-on-accent">Skip to content</a>
      <div className="md:grid md:min-h-screen md:grid-cols-[13rem_1fr]">
        <nav aria-label="Primary" className="hidden border-r border-line bg-surface p-2 md:block">
          <div className="px-3 py-3 text-base font-semibold">Pulseboard</div>
          {NAV.map(([href, label, isReady]) =>
            isReady ? (
              <Link key={label} href={href} aria-current={path === href ? 'page' : undefined}
                className={`block rounded-lg px-3 py-2 text-sm hover:bg-raised ${path === href ? 'bg-raised font-medium text-ink shadow-[inset_3px_0_var(--accent)]' : 'text-muted'}`}>
                {label}
              </Link>
            ) : (
              <span key={label} aria-disabled="true" title="Coming soon" className="block cursor-not-allowed rounded-lg px-3 py-2 text-sm text-muted opacity-50">{label}</span>
            ),
          )}
        </nav>
        <div className="min-w-0 pb-20 md:pb-0">
          <header className="sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b border-line bg-surface px-4 py-2">
            <span className="mr-auto text-sm text-muted" role="status">{live ? '● Live, updates every 5 s' : '○ Reconnecting…'}</span>
            <Link href="/noc" className="rounded-lg border border-line bg-raised px-3 py-1.5 text-sm hover:border-accent">NOC mode</Link>
            <button onClick={toggleTheme} className="rounded-lg border border-line bg-raised px-3 py-1.5 text-sm hover:border-accent">Switch theme</button>
            <input type="color" aria-label="Accent colour" defaultValue="#5b8cff" onChange={(e) => setAccent(e.target.value)} className="h-8 w-9 rounded border border-line bg-raised p-0.5" />
            <button onClick={signOut} className="rounded-lg border border-line bg-raised px-3 py-1.5 text-sm hover:border-accent">Sign out</button>
          </header>
          <main id="main" tabIndex={-1} className="mx-auto max-w-7xl p-4 md:p-6">{children}</main>
        </div>
      </div>
      <nav aria-label="Primary mobile" className="fixed inset-x-0 bottom-0 z-20 flex border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] md:hidden">
        {NAV.filter((n) => n[2]).map(([href, label]) => (
          <Link key={label} href={href} aria-current={path === href ? 'page' : undefined}
            className={`flex-1 py-3 text-center text-xs ${path === href ? 'font-semibold text-accent' : 'text-muted'}`}>{label}</Link>
        ))}
      </nav>
    </MotionConfig>
  );
}
