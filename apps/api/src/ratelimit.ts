// In-memory sign-in throttle: 5 failures per account+address, or 30 per address, locks that key for 15 minutes.
const WINDOW_MS = 15 * 60_000;
const fails = new Map<string, { n: number; first: number; until: number }>();

export function lockedFor(keys: string[], now = Date.now()): number {
  let wait = 0;
  for (const k of keys) {
    const e = fails.get(k);
    if (e && e.until > now) wait = Math.max(wait, Math.ceil((e.until - now) / 1000));
  }
  return wait;
}

export function recordFail(key: string, max: number, now = Date.now()): void {
  for (const [k, e] of fails) if (now - e.first > WINDOW_MS && e.until <= now) fails.delete(k);
  let e = fails.get(key);
  if (!e || now - e.first > WINDOW_MS) e = { n: 0, first: now, until: 0 };
  e.n++;
  if (e.n >= max) e.until = now + WINDOW_MS;
  fails.set(key, e);
}

export const recordOk = (key: string): void => { fails.delete(key); };
