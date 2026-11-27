import { createHash } from 'node:crypto';
import { Client } from 'ssh2';

export const fingerprint = (key: Buffer): string => 'SHA256:' + createHash('sha256').update(key).digest('base64').replace(/=+$/, '');
const MAX_OUTPUT = 2 * 1024 * 1024;

export interface SshTarget { host: string; port: number; username: string; privateKey: string; pinned?: string | null }

export function friendlySshError(e: unknown): string {
  const m = ((e as Error)?.message ?? String(e)).toLowerCase();
  if (/all configured authentication methods failed|authentication/.test(m)) return 'The device rejected the key. Check that the public key is in authorized_keys for this user, and that the file permissions are strict.';
  if (/econnrefused/.test(m)) return 'The connection was refused. Check that the SSH service is running and the port is right.';
  if (/etimedout|timed out|ehostunreach|enetunreach/.test(m)) return 'No answer. Check the address, the port and any firewall.';
  if (/enotfound|getaddrinfo/.test(m)) return 'That name could not be resolved.';
  if (/cannot parse privatekey|key/.test(m) && /parse|format/.test(m)) return 'The stored key could not be read. Generate a new key.';
  return `SSH error: ${((e as Error)?.message ?? 'unknown').slice(0, 120)}`;
}
const CHANGED = 'The device presented a different host key than the one you confirmed. This can mean the machine was reinstalled, or that something is impersonating it. Edit the device, run Test connection and compare the new fingerprint before trusting it.';

/**
 * Runs the collector over SSH. Only the fixed word "metrics" or "inventory" is ever sent; the device's authorized_keys
 * entry decides what actually runs. With a pinned host key, any other key stops the connection before anything is sent.
 */
export function runCollector(t: SshTarget, mode: 'metrics' | 'inventory'): Promise<{ stdout: string; hostKey: string }> {
  return new Promise((resolve, reject) => {
    const c = new Client();
    let hostKey = '', mismatch = false, settled = false;
    const end = (err: Error | null, out = '') => { if (settled) return; settled = true; clearTimeout(timer); c.destroy(); if (err) reject(err); else resolve({ stdout: out, hostKey }); };
    const timer = setTimeout(() => end(new Error('The collector took too long to answer.')), 45_000);
    c.on('ready', () => {
      c.exec(mode, (err, stream) => {
        if (err) return end(err);
        let out = '', over = false;
        stream.on('data', (d: Buffer) => { if (out.length < MAX_OUTPUT) out += d.toString('utf8'); else over = true; });
        stream.stderr.on('data', () => undefined);
        stream.on('close', () => end(over ? new Error('The collector returned too much data.') : null, out));
      });
    });
    c.on('error', (e) => end(new Error(mismatch ? CHANGED : friendlySshError(e))));
    c.on('close', () => end(new Error(mismatch ? CHANGED : 'The connection closed before any data arrived.')));
    c.connect({
      host: t.host, port: t.port, username: t.username, privateKey: t.privateKey, readyTimeout: 10_000, agent: undefined, tryKeyboard: false,
      hostVerifier: (key: Buffer | string) => {
        hostKey = fingerprint(Buffer.isBuffer(key) ? key : Buffer.from(key, 'hex'));
        if (t.pinned && hostKey !== t.pinned) { mismatch = true; return false; }
        return true;
      },
    });
  });
}
