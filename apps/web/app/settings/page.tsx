'use client';
import { useEffect, useState } from 'react';
import AccountTab from '@/components/settings/AccountTab';
import AuditTab from '@/components/settings/AuditTab';
import ChannelsTab from '@/components/settings/ChannelsTab';
import RulesTab from '@/components/settings/RulesTab';
import UsersTab from '@/components/settings/UsersTab';
import Shell from '@/components/Shell';
import { currentRole } from '@/lib/api';
import { useToast } from '@/lib/toast';

// Which tabs each role sees. This only hides screens: the server checks every request.
const TABS = [
  { id: 'rules', label: 'Alert rules', roles: ['owner', 'admin'] },
  { id: 'channels', label: 'Notifications', roles: ['owner', 'admin'] },
  { id: 'users', label: 'Users and roles', roles: ['owner'] },
  { id: 'audit', label: 'Audit log', roles: ['owner', 'admin', 'auditor'] },
  { id: 'account', label: 'My account', roles: ['owner', 'admin', 'operator', 'viewer', 'auditor'] },
];

export default function Settings() {
  const [role, setRole] = useState('');
  const [tab, setTab] = useState('account');
  const { push, node } = useToast();
  useEffect(() => { const r = currentRole(); setRole(r); setTab(TABS.find((t) => t.roles.includes(r))?.id ?? 'account'); }, []);
  const visible = TABS.filter((t) => t.roles.includes(role));

  const onKey = (e: React.KeyboardEvent, i: number) => {
    const n = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : -1;
    if (n < 0) return;
    const next = visible[(n + visible.length) % visible.length];
    setTab(next.id);
    document.getElementById(`tab-${next.id}`)?.focus();
  };

  return (
    <Shell live>
      <h1 className="mb-4 text-xl font-semibold">Settings</h1>
      <div role="tablist" aria-label="Settings sections" className="mb-4 flex flex-wrap gap-1 border-b border-line">
        {visible.map((t, i) => (
          <button key={t.id} id={`tab-${t.id}`} role="tab" aria-selected={tab === t.id} aria-controls={`panel-${t.id}`} tabIndex={tab === t.id ? 0 : -1}
            onClick={() => setTab(t.id)} onKeyDown={(e) => onKey(e, i)}
            className={`-mb-px rounded-t-lg border-b-2 px-4 py-2 text-sm ${tab === t.id ? 'border-accent font-semibold text-ink' : 'border-transparent text-muted hover:text-ink'}`}>{t.label}</button>
        ))}
      </div>
      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === 'rules' && <RulesTab toast={push} />}
        {tab === 'channels' && <ChannelsTab toast={push} />}
        {tab === 'users' && <UsersTab toast={push} />}
        {tab === 'audit' && <AuditTab toast={push} />}
        {tab === 'account' && <AccountTab toast={push} />}
      </div>
      {node}
    </Shell>
  );
}
