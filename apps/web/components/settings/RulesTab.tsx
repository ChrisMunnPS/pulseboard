'use client';
import type { AlertRule, Severity } from '@pulse/shared';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { btnPri, card, input, SEVERITIES } from './ui';

export default function RulesTab({ toast }: { toast: (t: string, bad?: boolean) => void }) {
  const [rules, setRules] = useState<AlertRule[]>([]);
  const [draft, setDraft] = useState<Record<string, AlertRule>>({});
  useEffect(() => { api<AlertRule[]>('/api/v1/rules').then(setRules).catch((e: Error) => toast(e.message, true)); }, [toast]);

  const cur = (r: AlertRule) => draft[r.key] ?? r;
  const edit = (r: AlertRule, patch: Partial<AlertRule>) => setDraft((d) => ({ ...d, [r.key]: { ...cur(r), ...patch } }));
  async function save(r: AlertRule) {
    const d = cur(r);
    try {
      setRules(await api<AlertRule[]>(`/api/v1/rules/${r.key}`, { method: 'PUT', body: JSON.stringify({ threshold: d.threshold, durationS: d.durationS, severity: d.severity, enabled: d.enabled }) }));
      setDraft(({ [r.key]: _, ...rest }) => rest);
      toast(`${r.name} saved`);
    } catch (e) { toast((e as Error).message, true); }
  }

  return (
    <div className={`${card} overflow-x-auto`}>
      <p className="mb-3 text-sm text-muted">An alert opens when a device stays past the limit for the chosen time, and closes by itself when it recovers. Alerts go to every enabled channel whose minimum severity they meet.</p>
      <table className="w-full min-w-[40rem] text-left text-sm">
        <thead className="text-muted"><tr><th className="p-2">On</th><th className="p-2">Rule</th><th className="p-2">Limit</th><th className="p-2">For (minutes)</th><th className="p-2">Severity</th><th className="p-2"><span className="sr-only">Save</span></th></tr></thead>
        <tbody>
          {rules.map((r) => {
            const d = cur(r);
            const dirty = draft[r.key] !== undefined;
            return (
              <tr key={r.key} className="border-t border-line align-top">
                <td className="p-2"><input type="checkbox" checked={d.enabled} onChange={(e) => edit(r, { enabled: e.target.checked })} aria-label={`${r.name} enabled`} /></td>
                <td className="p-2"><b>{r.name}</b>{!r.live && <div className="text-xs text-muted">○ Waiting for collectors: the simulated data cannot trigger this yet</div>}</td>
                <td className="p-2">{r.key === 'offline' ? <span className="text-muted">–</span> : <label className="flex items-center gap-2"><input type="number" className={`${input} w-24`} value={d.threshold} onChange={(e) => edit(r, { threshold: Number(e.target.value) })} aria-label={`${r.name} limit`} /><span className="text-muted">{r.unit}</span></label>}</td>
                <td className="p-2"><input type="number" min={0} className={`${input} w-20`} value={Math.round(d.durationS / 60)} onChange={(e) => edit(r, { durationS: Math.max(0, Number(e.target.value)) * 60 })} aria-label={`${r.name} duration in minutes`} /></td>
                <td className="p-2"><select className={`${input} w-36`} value={d.severity} onChange={(e) => edit(r, { severity: e.target.value as Severity })} aria-label={`${r.name} severity`}>{SEVERITIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></td>
                <td className="p-2"><button className={btnPri} disabled={!dirty} onClick={() => save(r)}>Save</button></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
