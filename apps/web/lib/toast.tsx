'use client';
import { useCallback, useState, type ReactNode } from 'react';

/** Small status message at the bottom of the screen, announced to screen readers. */
export function useToast() {
  const [msg, setMsg] = useState<{ text: string; bad: boolean } | null>(null);
  const push = useCallback((text: string, bad = false) => {
    setMsg({ text, bad });
    setTimeout(() => setMsg(null), 4000);
  }, []);
  const node: ReactNode = msg && (
    <div role={msg.bad ? 'alert' : 'status'} className={`fixed bottom-20 right-4 z-40 max-w-sm rounded-lg border bg-raised px-4 py-3 md:bottom-4 ${msg.bad ? 'border-crit text-crit' : 'border-line'}`}>
      {msg.bad ? '✖ ' : '✔ '}{msg.text}
    </div>
  );
  return { push, node };
}
