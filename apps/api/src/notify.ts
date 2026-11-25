import { SEVERITY_RANK, type Severity } from '@pulse/shared';
import nodemailer from 'nodemailer';
import { pool } from './db';
import { assertSafeTarget, parseTargetUrl } from './netsafe';
import { vault } from './vault-instance';

export interface Message { severity: Severity; title: string; detail: string; device: string; at: string }
export interface ChannelRow {
  id: string; type: 'email' | 'teams' | 'slack' | 'discord' | 'webhook'; name: string; enabled: boolean;
  min_severity: Severity; config: Record<string, unknown>; secret_enc: string | null;
}

const text = (m: Message) => `[${m.severity.toUpperCase()}] ${m.device}: ${m.title}. ${m.detail}`;

async function postJson(rawUrl: string, httpsOnly: boolean, body: unknown): Promise<void> {
  const url = parseTargetUrl(rawUrl, httpsOnly);
  await assertSafeTarget(url.hostname);
  const res = await fetch(url, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    redirect: 'manual', signal: AbortSignal.timeout(8000), // redirects are not followed: they could point somewhere blocked
  });
  if (res.status >= 300) throw new Error(`The receiver answered HTTP ${res.status}`);
}

export async function send(ch: ChannelRow, m: Message): Promise<void> {
  const secret = ch.secret_enc ? vault.open(ch.secret_enc) : '';
  switch (ch.type) {
    case 'teams': return postJson(secret, true, { text: text(m) });
    case 'slack': return postJson(secret, true, { text: text(m) });
    case 'discord': return postJson(secret, true, { content: text(m).slice(0, 1900) });
    case 'webhook': return postJson(secret, false, { event: 'alert', ...m });
    case 'email': {
      const c = ch.config as { host: string; port: number; secure: boolean; user: string; from: string; to: string };
      await assertSafeTarget(c.host);
      const auth = c.user ? { user: c.user, pass: secret } : undefined;
      const transport = nodemailer.createTransport({
        host: c.host, port: c.port, secure: c.secure, auth,
        requireTLS: !!auth && !c.secure, // never send the SMTP password without encryption
        connectionTimeout: 8000, greetingTimeout: 8000, socketTimeout: 10000,
      });
      await transport.sendMail({ from: c.from, to: c.to, subject: `[${m.severity.toUpperCase()}] ${m.device}: ${m.title}`, text: text(m) });
    }
  }
}

/** Sends to every enabled channel whose minimum severity this alert meets. Failures are logged, never thrown. */
export async function dispatch(m: Message, log: (msg: string) => void): Promise<void> {
  const { rows } = await pool.query<ChannelRow>('select * from notification_channels where enabled');
  await Promise.all(
    rows.filter((c) => SEVERITY_RANK[m.severity] >= SEVERITY_RANK[c.min_severity]).map((c) =>
      send(c, m).catch((e: Error) => log(`Notification to channel "${c.name}" (${c.type}) failed: ${e.message}`)),
    ),
  );
}
