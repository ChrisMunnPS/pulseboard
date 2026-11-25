import { execFile } from 'node:child_process';
import net from 'node:net';

export interface PingResult { lossPct: number; latencyMs: number | null; jitterMs: number | null }

/** Reads both the busybox (Alpine) and iputils (Debian) ping summaries. */
export function parsePing(out: string): PingResult {
  const loss = out.match(/(\d+(?:\.\d+)?)% packet loss/);
  const rtt = out.match(/min\/avg\/max[^=]*=\s*([\d.]+)\/([\d.]+)\/([\d.]+)(?:\/([\d.]+))?/);
  const lossPct = loss ? Number(loss[1]) : 100;
  if (!rtt) return { lossPct, latencyMs: null, jitterMs: null };
  const [min, avg, max, mdev] = [rtt[1], rtt[2], rtt[3], rtt[4]].map((v) => (v === undefined ? NaN : Number(v)));
  return { lossPct, latencyMs: avg, jitterMs: Number.isNaN(mdev) ? Math.round((max - min) * 10) / 10 : mdev };
}

export function runPing(host: string): Promise<PingResult> {
  if (!/^[A-Za-z0-9._:-]+$/.test(host) || host.startsWith('-')) return Promise.reject(new Error('Invalid address'));
  return new Promise((resolve, reject) => {
    execFile('ping', ['-c', '3', '-W', '2', host], { timeout: 12_000 }, (err, stdout) => {
      if ((err as NodeJS.ErrnoException | null)?.code === 'ENOENT') return reject(new Error('The ping tool is not available in the Pulseboard container.'));
      // ping exits non-zero on total loss; its output is still what we want
      resolve(parsePing(String(stdout)));
    });
  });
}

export function tcpCheck(host: string, port: number): Promise<number> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const sock = net.connect({ host, port, timeout: 3000 });
    sock.once('connect', () => { sock.destroy(); resolve(Date.now() - start); });
    sock.once('timeout', () => { sock.destroy(); reject(new Error(`No answer on port ${port}.`)); });
    sock.once('error', (e: NodeJS.ErrnoException) => reject(new Error(e.code === 'ECONNREFUSED' ? `Port ${port} refused the connection.` : e.code === 'ENOTFOUND' ? 'That name could not be resolved.' : `Could not connect: ${e.code ?? e.message}`)));
  });
}
