import dns from 'node:dns/promises';
import net from 'node:net';

// Outgoing notifications may reach internal systems (common for MSPs), but never loopback,
// link-local (including cloud metadata at 169.254.169.254), unspecified or multicast addresses.
function expandV6(input: string): number[] | null {
  // Turn a dotted IPv4 tail (::ffff:127.0.0.1) into two hex groups first
  const dotted = input.match(/^(.*:)(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  const ip = dotted ? `${dotted[1]}${((+dotted[2] << 8) | +dotted[3]).toString(16)}:${((+dotted[4] << 8) | +dotted[5]).toString(16)}` : input;
  const [head, tail = ''] = ip.split('::');
  const h = head ? head.split(':') : [];
  const t = tail ? tail.split(':') : [];
  if (ip.includes('::') ? h.length + t.length > 7 : h.length !== 8) return null;
  const groups = ip.includes('::') ? [...h, ...Array(8 - h.length - t.length).fill('0'), ...t] : h;
  const nums = groups.map((g) => parseInt(g || '0', 16));
  return nums.some((n) => Number.isNaN(n)) ? null : nums;
}

export function isBlockedIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 0 || a === 127 || (a === 169 && b === 254) || a >= 224;
  }
  if (net.isIPv6(ip)) {
    const g = expandV6(ip.toLowerCase().replace(/^\[|\]$/g, ''));
    if (!g) return true;
    if (g.slice(0, 5).every((x) => x === 0) && g[5] === 0xffff) return isBlockedIp(`${g[6] >> 8}.${g[6] & 255}.${g[7] >> 8}.${g[7] & 255}`);
    if (g.every((x) => x === 0) || (g.slice(0, 7).every((x) => x === 0) && g[7] === 1)) return true;
    return (g[0] & 0xffc0) === 0xfe80 || (g[0] & 0xff00) === 0xff00;
  }
  return true;
}

export async function assertSafeTarget(host: string): Promise<void> {
  const bare = host.replace(/^\[|\]$/g, '');
  const addrs = net.isIP(bare) ? [bare] : (await dns.lookup(bare, { all: true })).map((a) => a.address);
  if (addrs.length === 0 || addrs.some(isBlockedIp)) throw new Error('That address is not allowed (loopback, link-local or multicast).');
}

export function parseTargetUrl(raw: string, httpsOnly: boolean): URL {
  let u: URL;
  try { u = new URL(raw); } catch { throw new Error('Enter a valid URL.'); }
  if (u.protocol !== 'https:' && !(u.protocol === 'http:' && !httpsOnly)) throw new Error(httpsOnly ? 'The URL must start with https://' : 'The URL must start with https:// or http://');
  if (u.username || u.password) throw new Error('Do not put a username or password in the URL.');
  return u;
}

/** Returns a helpful message if this address cannot be monitored, or null if it is fine. */
export function checkMonitorAddress(host: string): string | null {
  const h = host.toLowerCase().replace(/^\[|\]$/g, '');
  if (h === 'localhost' || h.endsWith('.localhost') || /^127\./.test(h) || h === '::1')
    return 'localhost points at the Pulseboard container itself. To monitor the PC that runs Docker, use host.docker.internal.';
  if (net.isIP(h) && isBlockedIp(h)) return 'That address cannot be monitored (unspecified, link-local or multicast).';
  return null;
}
