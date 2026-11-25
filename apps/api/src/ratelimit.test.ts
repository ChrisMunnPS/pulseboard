import { describe, expect, it } from 'vitest';
import { lockedFor, recordFail, recordOk } from './ratelimit';

describe('sign-in throttle', () => {
  it('locks after the limit and clears on success', () => {
    const now = 1_000_000;
    for (let i = 0; i < 4; i++) recordFail('u:a', 5, now);
    expect(lockedFor(['u:a'], now)).toBe(0);
    recordFail('u:a', 5, now);
    expect(lockedFor(['u:a'], now)).toBeGreaterThan(0);
    expect(lockedFor(['u:a'], now + 15 * 60_000 + 1)).toBe(0);
    recordFail('u:b', 5, now); recordOk('u:b');
    expect(lockedFor(['u:b'], now)).toBe(0);
  });
});
