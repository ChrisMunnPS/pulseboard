'use client';
import { useEffect, useState, type ReactNode } from 'react';

export interface Widget { id: string; label: string; node: ReactNode }

/** Reorderable widgets. Drag with a mouse, or use the arrow buttons (keyboard and touch). Order is saved in the browser. */
export default function WidgetGrid({ widgets, storageKey }: { widgets: Widget[]; storageKey: string }) {
  const [order, setOrder] = useState<string[]>([]);
  const [dragging, setDragging] = useState<string | null>(null);
  const [note, setNote] = useState('');

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) ?? '[]');
      if (Array.isArray(saved)) setOrder(saved.filter((x): x is string => typeof x === 'string'));
    } catch { /* ignore a corrupt saved layout */ }
  }, [storageKey]);

  const ids = widgets.map((w) => w.id);
  const ordered = [...order.filter((i) => ids.includes(i)), ...ids.filter((i) => !order.includes(i))];

  const move = (id: string, to: number) => {
    const from = ordered.indexOf(id);
    if (to < 0 || to >= ordered.length || from === to) return;
    const next = [...ordered];
    next.splice(from, 1);
    next.splice(to, 0, id);
    setOrder(next);
    try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* storage unavailable */ }
    setNote(`${widgets.find((w) => w.id === id)?.label} moved to position ${to + 1} of ${next.length}`);
  };

  const btn = 'rounded border border-line bg-raised px-2 text-xs disabled:opacity-30';
  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        {ordered.map((id, i) => {
          const w = widgets.find((x) => x.id === id);
          if (!w) return null;
          return (
            <div key={id} draggable
              onDragStart={(e) => { setDragging(id); e.dataTransfer.effectAllowed = 'move'; }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); if (dragging) move(dragging, i); setDragging(null); }}
              onDragEnd={() => setDragging(null)}
              className={`group relative cursor-grab ${dragging === id ? 'opacity-40' : ''}`}>
              {w.node}
              <div className="absolute right-2 top-2 hidden gap-1 group-focus-within:flex group-hover:flex">
                <button className={btn} disabled={i === 0} aria-label={`Move ${w.label} earlier`} onClick={() => move(id, i - 1)}>◀</button>
                <button className={btn} disabled={i === ordered.length - 1} aria-label={`Move ${w.label} later`} onClick={() => move(id, i + 1)}>▶</button>
              </div>
            </div>
          );
        })}
      </div>
      <p className="sr-only" role="status" aria-live="polite">{note}</p>
    </>
  );
}
