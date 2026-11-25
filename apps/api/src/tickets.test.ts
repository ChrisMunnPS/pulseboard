import { describe, expect, it } from 'vitest';
import { issueTicket, redeemTicket } from './tickets';

const user = { sub: 'u1', role: 'viewer' as const };

describe('websocket tickets', () => {
  it('works once, then is gone', () => {
    const id = issueTicket(user);
    expect(redeemTicket(id)).toEqual(user);
    expect(redeemTicket(id)).toBeNull();
  });
  it('expires after 30 seconds', () => {
    const id = issueTicket(user, 1_000);
    expect(redeemTicket(id, 1_000 + 30_001)).toBeNull();
  });
  it('rejects unknown tickets', () => {
    expect(redeemTicket('nope')).toBeNull();
  });
});
