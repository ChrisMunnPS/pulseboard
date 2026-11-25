import { describe, expect, it } from 'vitest';
import { can } from './index';

describe('can', () => {
  it('lets viewers read but not acknowledge alerts', () => {
    expect(can('viewer', 'devices:read')).toBe(true);
    expect(can('viewer', 'alerts:ack')).toBe(false);
  });
  it('lets only owner and admin add devices', () => {
    expect(can('admin', 'device:manage')).toBe(true);
    expect(can('operator', 'device:manage')).toBe(false);
  });
  it('lets only owner, admin and auditor read the audit log', () => {
    expect(can('auditor', 'audit:read')).toBe(true);
    expect(can('operator', 'audit:read')).toBe(false);
  });
});
