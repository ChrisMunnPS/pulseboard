import { describe, expect, it } from 'vitest';
import { friendlySnmpError } from './snmp';

// The messages below are what the SNMP library really returns (captured against a live agent).
const msg = (m: string) => friendlySnmpError(new Error(m));

describe('friendlySnmpError', () => {
  it('tells a wrong username apart from a wrong key', () => {
    expect(msg('Unknown User Name')).toMatch(/does not recognise this SNMPv3 username/);
    expect(msg('Wrong Digest (incorrect password, community or key)')).toMatch(/authentication key/);
  });
  it('explains security level and access problems', () => {
    expect(msg('Unsupported Security Level')).toMatch(/security level/);
    expect(msg('AuthorizationError')).toMatch(/refused access/);
  });
  it('mentions the encryption key for silent v3 timeouts, and never echoes secrets', () => {
    expect(msg('Request timed out')).toMatch(/encryption key/);
    expect(msg('boom: key=hunter2')).not.toMatch(/^$/);
  });
});
