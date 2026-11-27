import { describe, expect, it } from 'vitest';
import { authorizedLine, newKey, peekKey, publicLineOf, takeKey } from './sshkeys';

describe('ssh keys', () => {
  it('produces a standard OpenSSH ed25519 public key line', () => {
    const k = newKey('u1')!;
    expect(k.publicKey).toMatch(/^ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAI[A-Za-z0-9+/]{43}$/);
  });
  it('keeps the private half private to its creator, and uses it up once taken', () => {
    const k = newKey('owner-a')!;
    expect(peekKey(k.keyId, 'owner-b')).toBeNull();
    const pem = takeKey(k.keyId, 'owner-a');
    expect(pem).toContain('BEGIN OPENSSH PRIVATE KEY');
    expect(publicLineOf(pem!)).toBe(k.publicKey);
    expect(takeKey(k.keyId, 'owner-a')).toBeNull();
  });
  it('forgets keys after 30 minutes and limits how many one person can hold', () => {
    const k = newKey('owner-c', 1000)!;
    expect(peekKey(k.keyId, 'owner-c', 1000 + 30 * 60_000 + 1)).toBeNull();
    let made = 0; for (let i = 0; i < 15; i++) if (newKey('owner-d')) made++;
    expect(made).toBe(10);
  });
  it('restricts the key to one read-only command and switches off forwarding', () => {
    const l = authorizedLine('windows', 'ssh-ed25519 AAAA', 'my pc!');
    expect(l).toContain('command="powershell.exe');
    expect(l).toMatch(/no-port-forwarding,no-agent-forwarding,no-X11-forwarding,no-pty ssh-ed25519 AAAA pulseboard-my-pc-$/);
    expect(authorizedLine('linux', 'ssh-ed25519 AAAA', 'x')).toContain('command="/usr/local/bin/pulseboard-collect"');
  });
});
