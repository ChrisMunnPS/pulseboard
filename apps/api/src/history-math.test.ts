import { describe, expect, it } from 'vitest';
import { availability, daysUntilFull } from './history-math';

const H = 3_600_000;
describe('availability', () => {
  it('counts time offline against the device', () => {
    const r = availability([{ at: 0, status: 'healthy' }, { at: 6 * H, status: 'offline' }, { at: 8 * H, status: 'healthy' }], 0, 10 * H);
    expect(r).toEqual({ pct: 80, outages: 1 });
  });
  it('uses the status in force when the window opens, and ignores unknown time', () => {
    const r = availability([{ at: -5 * H, status: 'offline' }, { at: 2 * H, status: 'healthy' }], 0, 10 * H);
    expect(r.pct).toBe(80);
    expect(availability([{ at: 5 * H, status: 'unknown' }], 0, 10 * H).pct).toBeNull();
  });
  it('is null with no history', () => {
    expect(availability([], 0, H).pct).toBeNull();
  });
});
describe('daysUntilFull', () => {
  it('projects from the growth rate', () => expect(daysUntilFull(80, 2, 100)).toBe(10));
  it('says nothing without enough data or growth', () => {
    expect(daysUntilFull(80, 2, 5)).toBeNull();
    expect(daysUntilFull(80, 0, 100)).toBeNull();
    expect(daysUntilFull(80, -1, 100)).toBeNull();
  });
});
