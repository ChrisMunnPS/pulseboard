import { randomUUID } from 'node:crypto';
import type { Role } from '@pulse/shared';

// One-time, short-lived tickets let the browser open a WebSocket without putting its sign-in token in the URL.
const TTL_MS = 30_000;
const tickets = new Map<string, { sub: string; role: Role; exp: number }>();

export function issueTicket(user: { sub: string; role: Role }, now = Date.now()): string {
  for (const [id, t] of tickets) if (t.exp <= now) tickets.delete(id);
  const id = randomUUID();
  tickets.set(id, { sub: user.sub, role: user.role, exp: now + TTL_MS });
  return id;
}

/** Returns the user once, then forgets the ticket. */
export function redeemTicket(id: string, now = Date.now()): { sub: string; role: Role } | null {
  const t = tickets.get(id);
  tickets.delete(id);
  return t && t.exp > now ? { sub: t.sub, role: t.role } : null;
}
