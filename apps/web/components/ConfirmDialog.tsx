'use client';
import { useEffect, useRef } from 'react';

export default function ConfirmDialog(props: { title: string; body: string; confirmLabel: string; onConfirm: () => void; onCancel: () => void }) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const latest = useRef(props);
  latest.current = props;

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    cancelRef.current?.focus(); // safest choice has focus first
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') latest.current.onCancel();
      if (e.key !== 'Tab') return;
      const items = [...document.querySelectorAll<HTMLElement>('[data-dialog] button')];
      const first = items[0], last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); previous?.focus(); };
  }, []);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4">
      <div data-dialog role="alertdialog" aria-modal="true" aria-labelledby="dialog-title" className="w-full max-w-md rounded-xl border border-line bg-surface p-5">
        <h2 id="dialog-title" className="text-lg font-semibold">{props.title}</h2>
        <p className="mt-2 text-muted">{props.body}</p>
        <div className="mt-5 flex justify-end gap-2">
          <button ref={cancelRef} onClick={props.onCancel} className="rounded-lg border border-line bg-raised px-3 py-1.5">Cancel</button>
          <button onClick={props.onConfirm} className="rounded-lg border border-crit px-3 py-1.5 text-crit">{props.confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}
