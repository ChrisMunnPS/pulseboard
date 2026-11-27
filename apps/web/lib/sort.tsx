'use client';
import { useState, type ReactNode } from 'react';

type Dir = 'asc' | 'desc';
type Val = string | number | boolean | null | undefined;
export interface SortState { key: string; dir: Dir; toggle: (k: string) => void }

const norm = (v: Val): string | number | null => (v === null || v === undefined || v === '' ? null : typeof v === 'boolean' ? Number(v) : v);

/** Click-to-sort for any table. Empty values always sort last, whichever direction is chosen. */
export function useSort<T>(rows: T[], cols: Record<string, (r: T) => Val>, initial: { key: string; dir?: Dir; tie?: string }) {
  const [key, setKey] = useState(initial.key);
  const [dir, setDir] = useState<Dir>(initial.dir ?? 'asc');
  const toggle = (k: string) => { if (k === key) setDir(dir === 'asc' ? 'desc' : 'asc'); else { setKey(k); setDir('asc'); } };
  const cmp = (a: Val, b: Val) => {
    const x = norm(a), y = norm(b);
    if (x === null || y === null) return x === y ? 0 : x === null ? 1 : -1; // empty last
    return typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), undefined, { numeric: true, sensitivity: 'base' });
  };
  const get = cols[key];
  const m = dir === 'asc' ? 1 : -1;
  const sorted = get ? [...rows].sort((a, b) => {
    const x = norm(get(a)), y = norm(get(b));
    if (x === null || y === null) return cmp(x, y); // not flipped by direction
    return cmp(x, y) * m || (initial.tie && cols[initial.tie] ? cmp(cols[initial.tie](a), cols[initial.tie](b)) : 0);
  }) : rows;
  return { rows: sorted, sort: { key, dir, toggle } as SortState };
}

export function SortTh({ label, k, sort, className = '' }: { label: ReactNode; k: string; sort: SortState; className?: string }) {
  const active = sort.key === k;
  return (
    <th scope="col" aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'} className={`p-3 font-medium ${className}`}>
      <button type="button" onClick={() => sort.toggle(k)} className="inline-flex items-center gap-1 rounded hover:text-ink">
        <span>{label}</span><span aria-hidden="true" className={active ? 'text-accent' : 'opacity-40'}>{active ? (sort.dir === 'asc' ? '▲' : '▼') : '↕'}</span>
      </button>
    </th>
  );
}
