import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';

/** AES-256-GCM encryption for secrets at rest. The key is derived from the given secret (HKDF-SHA256). */
export function makeVault(secret: string) {
  const key = Buffer.from(hkdfSync('sha256', secret, 'pulseboard-v1', 'secrets-at-rest', 32));
  return {
    seal(plain: string): string {
      const iv = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', key, iv);
      const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
      return ['v1', iv.toString('base64'), cipher.getAuthTag().toString('base64'), enc.toString('base64')].join('.');
    },
    open(sealed: string): string {
      const [version, iv, tag, data] = sealed.split('.');
      if (version !== 'v1' || !iv || !tag || !data) throw new Error('Unreadable secret');
      const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64'));
      decipher.setAuthTag(Buffer.from(tag, 'base64'));
      return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString('utf8');
    },
  };
}
