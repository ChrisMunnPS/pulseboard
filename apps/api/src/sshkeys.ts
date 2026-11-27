import { generateKeyPairSync, randomBytes, randomUUID } from 'node:crypto';

// A key is generated before the device is saved, so the administrator can install the public half first.
// The private half stays here (in memory, for 30 minutes) until the device is saved, then it is stored encrypted.
const pending = new Map<string, { pem: string; owner: string; exp: number }>();
const TTL_MS = 30 * 60_000, MAX_PER_OWNER = 10, MAX_TOTAL = 100;

const str = (b: Buffer): Buffer => { const l = Buffer.alloc(4); l.writeUInt32BE(b.length); return Buffer.concat([l, b]); };
const TYPE = Buffer.from('ssh-ed25519');
const wire = (raw: Buffer): Buffer => Buffer.concat([str(TYPE), str(raw)]);

/** An unencrypted OpenSSH private key (the format ssh2 and every SSH server understand). */
function openSshPrivate(seed: Buffer, pub: Buffer, comment: string): string {
  const check = randomBytes(4);
  let priv = Buffer.concat([check, check, str(TYPE), str(pub), str(Buffer.concat([seed, pub])), str(Buffer.from(comment))]);
  priv = Buffer.concat([priv, Buffer.from(Array.from({ length: (8 - (priv.length % 8)) % 8 }, (_, i) => i + 1))]);
  const n = Buffer.alloc(4); n.writeUInt32BE(1);
  const body = Buffer.concat([Buffer.from('openssh-key-v1\0'), str(Buffer.from('none')), str(Buffer.from('none')), str(Buffer.alloc(0)), n, str(wire(pub)), str(priv)]);
  return `-----BEGIN OPENSSH PRIVATE KEY-----\n${body.toString('base64').match(/.{1,70}/g)!.join('\n')}\n-----END OPENSSH PRIVATE KEY-----\n`;
}

/** The "ssh-ed25519 AAAA…" line for a stored private key, read from the key itself. */
export function publicLineOf(pem: string): string {
  const body = Buffer.from(pem.replace(/-----[A-Z ]+-----/g, '').replace(/\s+/g, ''), 'base64');
  let at = 15; // after "openssh-key-v1\0"
  const read = () => { const len = body.readUInt32BE(at); const out = body.subarray(at + 4, at + 4 + len); at += 4 + len; return out; };
  read(); read(); read();               // cipher, kdf, kdf options
  at += 4;                              // number of keys
  return `ssh-ed25519 ${read().toString('base64')}`;
}

const sweep = (now: number) => { for (const [id, k] of pending) if (k.exp <= now) pending.delete(id); };

export function newKey(owner: string, now = Date.now()): { keyId: string; publicKey: string } | null {
  sweep(now);
  if (pending.size >= MAX_TOTAL || [...pending.values()].filter((k) => k.owner === owner).length >= MAX_PER_OWNER) return null;
  const pair = generateKeyPairSync('ed25519');
  const pem = openSshPrivate(pair.privateKey.export({ type: 'pkcs8', format: 'der' }).subarray(-32), pair.publicKey.export({ type: 'spki', format: 'der' }).subarray(-32), 'pulseboard');
  const keyId = randomUUID();
  pending.set(keyId, { pem, owner, exp: now + TTL_MS });
  return { keyId, publicKey: publicLineOf(pem) };
}

/** Looks at a pending key without using it up (for Test connection). Only its creator can see it. */
export function peekKey(keyId: string, owner: string, now = Date.now()): string | null {
  const k = pending.get(keyId);
  return k && k.owner === owner && k.exp > now ? k.pem : null;
}
export function takeKey(keyId: string, owner: string, now = Date.now()): string | null {
  const pem = peekKey(keyId, owner, now);
  if (pem) pending.delete(keyId);
  return pem;
}

/**
 * The authorized_keys line. It restricts the key to one fixed, read-only script: whatever the client asks for,
 * the server runs only that script. Forwarding and terminals are switched off.
 */
export function authorizedLine(os: 'windows' | 'linux', publicKey: string, label: string): string {
  const command = os === 'windows'
    ? 'powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File C:\\ProgramData\\Pulseboard\\collect.ps1'
    : '/usr/local/bin/pulseboard-collect';
  const comment = `pulseboard-${label.replace(/[^A-Za-z0-9._-]/g, '-').slice(0, 40)}`;
  return `command="${command}",no-port-forwarding,no-agent-forwarding,no-X11-forwarding,no-pty ${publicKey} ${comment}`;
}
