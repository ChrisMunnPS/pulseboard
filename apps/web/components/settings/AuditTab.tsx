'use client';
import type { AuditRow } from '@pulse/shared';
import { useCallback, useEffect, useState } from 'react';
import { api, download } from '@/lib/api';
import { SortTh, useSort } from '@/lib/sort';
import { btn, card, input } from './ui';

const PAGE = 100;
export default function AuditTab({ toast }: { toast: (t: string, bad?: boolean) => void }) {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [more, setMore] = useState(false);
  const [q, setQ] = useState('');
  const [result, setResult] = useState('');
  const { rows: sortedRows, sort } = useSort(rows, { at: (r) => r.at, actor: (r) => r.actor, action: (r) => r.action, target: (r) => r.target, result: (r) => r.result }, { key: 'at', dir: 'desc' });
  const qs = (offset: number) => new URLSearchParams({ q, result, limit: String(PAGE), offset: String(offset) }).toString();

  const load = useCallback(async (offset: number) => {
    try {
      const r = await api<{ rows: AuditRow[]; hasMore: boolean }>(`/api/v1/audit?${qs(offset)}`);
      setRows((prev) => (offset ? [...prev, ...r.rows] : r.rows)); setMore(r.hasMore);
    } catch (e) { toast((e as Error).message, true); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, result, toast]);
  useEffect(() => { const t = setTimeout(() => load(0), 250); return () => clearTimeout(t); }, [load]);

  return (
    <div className={`${card} space-y-3`}>
      <div className="flex flex-wrap gap-2">
        <input className={`${input} max-w-xs`} placeholder="Search user, action or target" aria-label="Search the audit log" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className={`${input} w-40`} aria-label="Filter by result" value={result} onChange={(e) => setResult(e.target.value)}><option value="">All results</option><option value="ok">ok</option><option value="denied">denied</option><option value="failed">failed</option></select>
        <button className={`${btn} ml-auto`} onClick={() => download(`/api/v1/audit.csv?${qs(0)}`, 'pulseboard-audit.csv').catch((e: Error) => toast(e.message, true))}>Export CSV</button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[40rem] text-left text-sm">
          <thead className="text-muted"><tr><SortTh label="Time" k="at" sort={sort} /><SortTh label="User" k="actor" sort={sort} /><SortTh label="Action" k="action" sort={sort} /><SortTh label="Target" k="target" sort={sort} /><SortTh label="Result" k="result" sort={sort} /></tr></thead>
          <tbody>{sortedRows.map((r) => (
            <tr key={r.id} className="border-t border-line"><td className="whitespace-nowrap p-2">{new Date(r.at).toLocaleString()}</td><td className="p-2">{r.actor ?? '–'}</td><td className="p-2">{r.action}</td><td className="p-2">{r.target ?? '–'}</td>
              <td className={`p-2 ${r.result === 'ok' ? '' : 'text-crit'}`}>{r.result === 'ok' ? '✔ ok' : `✖ ${r.result}`}</td></tr>))}
            {rows.length === 0 && <tr><td className="p-3 text-muted" colSpan={5}>No entries match.</td></tr>}</tbody>
        </table>
      </div>
      {more && <button className={btn} onClick={() => load(rows.length)}>Load more</button>}
    </div>
  );
}
