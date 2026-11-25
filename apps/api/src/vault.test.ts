import { describe, expect, it } from 'vitest';
import { makeVault } from './vault';

const secret = 'a'.repeat(40);
describe('vault', () => {
  it('round-trips and never stores plaintext', () => {
    const v = makeVault(secret);
    const sealed = v.seal('https://hooks.example.com/abc');
    expect(sealed).not.toContain('hooks.example.com');
    expect(v.open(sealed)).toBe('https://hooks.example.com/abc');
  });
  it('uses a fresh IV every time', () => {
    const v = makeVault(secret);
    expect(v.seal('x')).not.toBe(v.seal('x'));
  });
  it('cannot be opened with a different key, or after tampering', () => {
    const sealed = makeVault(secret).seal('x');
    expect(() => makeVault('b'.repeat(40)).open(sealed)).toThrow();
    const parts = sealed.split('.');
    parts[3] = Buffer.from('tampered').toString('base64');
    expect(() => makeVault(secret).open(parts.join('.'))).toThrow();
  });
});
