import type { IfaceInfo, Inventory, ProcessInfo, SnmpInput, Volume } from '@pulse/shared';
import snmp from 'net-snmp';
import { summariseStorage, type StorageRow } from './storage';

export interface SnmpCfg extends Omit<SnmpInput, 'port'> { port: number }
type Val = string | number | bigint | null;
/* eslint-disable @typescript-eslint/no-explicit-any */
interface Sess { get(o: string[], cb: (e: any, v: any[]) => void): void; subtree(o: string, n: number, feed: (v: any[]) => void, done: (e?: any) => void): void; close(): void }

const OID = {
  sysDescr: '1.3.6.1.2.1.1.1.0', sysUpTime: '1.3.6.1.2.1.1.3.0', sysName: '1.3.6.1.2.1.1.5.0',
  hrProcessorLoad: '1.3.6.1.2.1.25.3.3.1.2',
  hrStorageType: '1.3.6.1.2.1.25.2.3.1.2', hrStorageDescr: '1.3.6.1.2.1.25.2.3.1.3', hrStorageUnits: '1.3.6.1.2.1.25.2.3.1.4', hrStorageSize: '1.3.6.1.2.1.25.2.3.1.5', hrStorageUsed: '1.3.6.1.2.1.25.2.3.1.6',
  ssCpuIdle: '1.3.6.1.4.1.2021.11.11.0',
  ifDescr: '1.3.6.1.2.1.2.2.1.2', ifSpeed: '1.3.6.1.2.1.2.2.1.5', ifOper: '1.3.6.1.2.1.2.2.1.8', ifIn: '1.3.6.1.2.1.2.2.1.10', ifOut: '1.3.6.1.2.1.2.2.1.16',
  ifName: '1.3.6.1.2.1.31.1.1.1.1', ifHCIn: '1.3.6.1.2.1.31.1.1.1.6', ifHCOut: '1.3.6.1.2.1.31.1.1.1.10', ifHighSpeed: '1.3.6.1.2.1.31.1.1.1.15', ifAlias: '1.3.6.1.2.1.31.1.1.1.18',
  swName: '1.3.6.1.2.1.25.4.2.1.2', swMem: '1.3.6.1.2.1.25.5.1.1.2',
  hrSystemUptime: '1.3.6.1.2.1.25.1.1.0',
  sysContact: '1.3.6.1.2.1.1.4.0', sysLocation: '1.3.6.1.2.1.1.6.0', hrMemorySize: '1.3.6.1.2.1.25.2.2.0',
  hrDevType: '1.3.6.1.2.1.25.3.2.1.2', hrDevDescr: '1.3.6.1.2.1.25.3.2.1.3',
  entClass: '1.3.6.1.2.1.47.1.1.1.1.5', entFw: '1.3.6.1.2.1.47.1.1.1.1.9', entSw: '1.3.6.1.2.1.47.1.1.1.1.10', entSerial: '1.3.6.1.2.1.47.1.1.1.1.11', entMfg: '1.3.6.1.2.1.47.1.1.1.1.12', entModel: '1.3.6.1.2.1.47.1.1.1.1.13',
  // Synology vendor MIB (best effort; not tested against real hardware here)
  synoModel: '1.3.6.1.4.1.6574.1.5.1.0', synoSerial: '1.3.6.1.4.1.6574.1.5.2.0', synoVersion: '1.3.6.1.4.1.6574.1.5.3.0', synoDiskModel: '1.3.6.1.4.1.6574.2.1.1.3', synoDiskType: '1.3.6.1.4.1.6574.2.1.1.4', synoDiskStatus: '1.3.6.1.4.1.6574.2.1.1.5', synoDiskTemp: '1.3.6.1.4.1.6574.2.1.1.6', synoSysTemp: '1.3.6.1.4.1.6574.1.2.0',
};
const HR_CPU = '1.3.6.1.2.1.25.3.1.3', HR_DISK = '1.3.6.1.2.1.25.3.1.6'; // hrDevice types: processor, disk storage
const MAX_ROWS = 2000;

// ASN.1 / SNMP type numbers: OctetString 4, Null 5, ObjectIdentifier 6, Counter64 70, noSuchObject 128, noSuchInstance 129, endOfMibView 130
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function norm(vb: any): Val {
  switch (vb.type) {
    case 4: return Buffer.isBuffer(vb.value) ? vb.value.toString('utf8') : String(vb.value);
    case 6: return String(vb.value);
    case 70: return Buffer.isBuffer(vb.value) ? BigInt('0x' + (vb.value.toString('hex') || '0')) : BigInt(Number(vb.value));
    case 5: case 128: case 129: case 130: return null;
    default: return typeof vb.value === 'number' ? vb.value : Number(vb.value);
  }
}

/** Turns library errors into something an administrator can act on. Never includes keys or community strings. */
export function friendlySnmpError(e: unknown): string {
  const m = ((e as Error)?.message ?? String(e)).toLowerCase();
  if (/unknown user|username/.test(m)) return 'The device does not recognise this SNMPv3 username. Names are case-sensitive, so check the spelling and that there is no stray space. Also check that SNMPv3 is turned on and saved on the device, and that this is the SNMPv3 username (not the device name).';
  if (/wrong digest|authentication|not in time/.test(m)) return 'The device recognised the user but rejected the authentication key. Check the authentication password and that the protocol (SHA or SHA-256 and so on) matches the device.';
  if (/unsupported security level/.test(m)) return 'The user exists, but the device does not allow this security level for it. Match the level set on the device: with authentication and encryption, with authentication only, or neither.';
  if (/authorization|not authorized|no access/.test(m)) return 'The device refused access. The SNMP user or community may not be allowed to read data, or only at a different security level.';
  if (/decrypt|privacy/.test(m)) return 'The device could not decrypt the request. Check the encryption key and protocol.';
  if (/timed out|timeout/.test(m)) return 'No SNMP response. Check the address and port, that SNMP is enabled and allows queries from this server (UDP 161, and any firewall), and the credentials. With SNMPv3, a wrong encryption key or protocol also shows up as no response.';
  if (/enotfound|getaddrinfo/.test(m)) return 'That name could not be resolved.';
  return `SNMP error: ${((e as Error)?.message ?? 'unknown').slice(0, 120)}`;
}

function session(host: string, c: SnmpCfg): Sess {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lib = snmp as any;
  const base = { port: c.port, timeout: 3000, retries: 1, transport: host.includes(':') ? 'udp6' : 'udp4' };
  if (c.version === 'v2c') return lib.createSession(host, c.community ?? '', { ...base, version: lib.Version2c }) as Sess;
  const level = lib.SecurityLevel[c.securityLevel ?? 'noAuthNoPriv'];
  const user: Record<string, unknown> = { name: c.username ?? '', level };
  if (c.securityLevel !== 'noAuthNoPriv') { user.authProtocol = lib.AuthProtocols[c.authProtocol ?? 'sha']; user.authKey = c.authKey ?? ''; }
  if (c.securityLevel === 'authPriv') { user.privProtocol = lib.PrivProtocols[c.privProtocol ?? 'aes']; user.privKey = c.privKey ?? ''; }
  return lib.createV3Session(host, user, { ...base, version: lib.Version3 }) as Sess;
}

const withTimeout = <T>(p: Promise<T>, ms: number): Promise<T> =>
  Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error('timed out')), ms))]);

const get = (s: Sess, oids: string[]) => new Promise<Map<string, Val>>((res, rej) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  s.get(oids, (err: any, vbs: any[]) => {
    if (err) return rej(err);
    const m = new Map<string, Val>();
    for (const vb of vbs) if (!snmp.isVarbindError(vb)) m.set(vb.oid, norm(vb));
    res(m);
  });
});

/** Walks a table; keys are the index part of each OID. A missing table gives an empty map. */
const walk = (s: Sess, base: string) => new Promise<Map<string, Val>>((res, rej) => {
  const m = new Map<string, Val>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  s.subtree(base, 20, (vbs: any[]) => {
    for (const vb of vbs) if (!snmp.isVarbindError(vb) && m.size < MAX_ROWS) m.set(vb.oid.slice(base.length + 1), norm(vb));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }, (err?: any) => (err ? rej(err) : res(m)));
});
const soft = (p: Promise<Map<string, Val>>) => p.catch(() => new Map<string, Val>());
const num = (v: Val | undefined): number | null => (v === null || v === undefined ? null : Number(v));

export interface Identify { sysDescr: string; sysName: string; uptimeS: number | null; rttMs: number }

export async function identify(host: string, cfg: SnmpCfg): Promise<Identify> {
  const s = session(host, cfg);
  try {
    const t0 = Date.now();
    const m = await withTimeout(get(s, [OID.sysDescr, OID.sysUpTime, OID.sysName]), 15_000);
    if (m.size === 0) throw new Error('timed out');
    const up = num(m.get(OID.sysUpTime));
    return { sysDescr: String(m.get(OID.sysDescr) ?? ''), sysName: String(m.get(OID.sysName) ?? ''), uptimeS: up === null ? null : Math.floor(up / 100), rttMs: Date.now() - t0 };
  } finally { s.close(); }
}

export interface Collected {
  sysDescr: string; uptimeS: number | null; rttMs: number;
  cpu: number | null; cores: number[]; memory: number | null; disk: number | null;
  volumes: Volume[]; interfaces: IfaceInfo[]; processes: ProcessInfo[]; inventory: Inventory | null;
}
export type Counters = Map<string, { t: number; inO: bigint; outO: bigint }>;

export async function collect(deviceId: string, host: string, cfg: SnmpCfg, counters: Counters, withInventory = false): Promise<Collected> {
  const s = session(host, cfg);
  try {
    return await withTimeout(collectInner(s, deviceId, counters, withInventory), 30_000);
  } finally { s.close(); }
}

async function collectInner(s: Sess, id: string, counters: Counters, withInventory: boolean): Promise<Collected> {
  const t0 = Date.now();
  const sys = await get(s, [OID.sysDescr, OID.sysUpTime, OID.hrSystemUptime]);
  if (sys.size === 0) throw new Error('timed out');
  const rttMs = Date.now() - t0;
  // hrSystemUptime is the machine's uptime; sysUpTime is only how long the SNMP service has been running
  const up = num(sys.get(OID.hrSystemUptime)) ?? num(sys.get(OID.sysUpTime));

  // CPU: per-core load from the host resources MIB, else the UCD idle counter (Linux, many NAS units)
  const load = await soft(walk(s, OID.hrProcessorLoad));
  let cores = [...load.values()].map(Number).filter((n) => Number.isFinite(n)).slice(0, 128);
  let cpu: number | null = cores.length ? Math.round(cores.reduce((a, b) => a + b, 0) / cores.length) : null;
  if (cpu === null) {
    const idle = num((await get(s, [OID.ssCpuIdle]).catch(() => new Map<string, Val>())).get(OID.ssCpuIdle));
    if (idle !== null) cpu = Math.round(100 - idle);
    cores = [];
  }

  // Memory and disks from hrStorage (cache excluded, system and duplicate mounts dropped)
  const [types, descr, units, size, used] = await Promise.all([OID.hrStorageType, OID.hrStorageDescr, OID.hrStorageUnits, OID.hrStorageSize, OID.hrStorageUsed].map((o) => soft(walk(s, o))));
  const rows: StorageRow[] = [...types].map(([idx, type]) => ({ type: String(type), descr: String(descr.get(idx) ?? `Disk ${idx}`), units: num(units.get(idx)) ?? 0, size: num(size.get(idx)) ?? 0, used: num(used.get(idx)) ?? 0 }));
  const { memory, volumes } = summariseStorage(rows);
  const disk = volumes.length ? Math.max(...volumes.map((v) => v.usedPct)) : null;

  // Interfaces (rates come from the change in counters between polls)
  const [names, ifDescr, alias, oper, speed, hiSpeed, hcIn, hcOut, in32, out32] = await Promise.all(
    [OID.ifName, OID.ifDescr, OID.ifAlias, OID.ifOper, OID.ifSpeed, OID.ifHighSpeed, OID.ifHCIn, OID.ifHCOut, OID.ifIn, OID.ifOut].map((o) => soft(walk(s, o))));
  const now = Date.now();
  const interfaces: IfaceInfo[] = [];
  for (const [idx, o] of oper) {
    const name = String(names.get(idx) ?? ifDescr.get(idx) ?? `if${idx}`).slice(0, 40);
    if (/^lo\d*$/i.test(name) || interfaces.length >= 64) continue;
    const hc = hcIn.has(idx);
    const cin = BigInt((hc ? hcIn.get(idx) : in32.get(idx)) ?? 0), cout = BigInt((hc ? hcOut.get(idx) : out32.get(idx)) ?? 0);
    const wrap = hc ? 2n ** 64n : 2n ** 32n;
    const key = `${id}:${idx}`, prev = counters.get(key);
    let inBps: number | null = null, outBps: number | null = null;
    if (prev && now - prev.t > 1000) {
      const secs = (now - prev.t) / 1000;
      inBps = Math.round((Number((cin - prev.inO + (cin < prev.inO ? wrap : 0n))) * 8) / secs);
      outBps = Math.round((Number((cout - prev.outO + (cout < prev.outO ? wrap : 0n))) * 8) / secs);
    }
    counters.set(key, { t: now, inO: cin, outO: cout });
    const mbps = num(hiSpeed.get(idx)) || (num(speed.get(idx)) ?? 0) / 1e6;
    interfaces.push({ index: Number(idx), name, alias: String(alias.get(idx) ?? '').slice(0, 60), up: num(oper.get(idx)) === 1, speedMbps: mbps ? Math.round(mbps) : null, inBps, outBps });
  }

  // Top processes by memory (the standard MIB has no instantaneous CPU figure)
  const [swNames, swMem] = await Promise.all([soft(walk(s, OID.swName)), soft(walk(s, OID.swMem))]);
  const processes: ProcessInfo[] = [...swNames].map(([idx, n]) => ({ pid: Number(idx), name: String(n).slice(0, 48), cpu: null, memGb: Math.round(((num(swMem.get(idx)) ?? 0) / 1048576) * 100) / 100 }))
    .sort((a, b) => b.memGb - a.memGb).slice(0, 12);

  const inventory = withInventory ? await readInventory(s).catch(() => null) : null;
  return { sysDescr: String(sys.get(OID.sysDescr) ?? ''), uptimeS: up === null ? null : Math.floor(up / 100), rttMs, cpu, cores, memory, disk, volumes, interfaces, processes, inventory };
}

const text = (v: Val | undefined, max = 120): string | null => {
  const t = v === null || v === undefined ? '' : String(v).replace(/[\u0000-\u001f]/g, ' ').trim();
  return t ? t.slice(0, max) : null;
};

/** Hardware details that standard SNMP tables can provide. RAM modules, memory speed and BIOS are not among them. */
async function readInventory(s: Sess): Promise<Inventory> {
  const sys = await get(s, [OID.sysDescr, OID.sysName, OID.sysContact, OID.sysLocation, OID.hrMemorySize, OID.synoModel, OID.synoSerial, OID.synoVersion, OID.synoSysTemp]).catch(() => new Map<string, Val>());
  const [devType, devDescr, entClass, entSerial, entMfg, entModel, entFw, entSw, synoDisk, synoType, synoStatus, synoTemp] = await Promise.all(
    [OID.hrDevType, OID.hrDevDescr, OID.entClass, OID.entSerial, OID.entMfg, OID.entModel, OID.entFw, OID.entSw, OID.synoDiskModel, OID.synoDiskType, OID.synoDiskStatus, OID.synoDiskTemp].map((o) => soft(walk(s, o))));

  const cpus = [...devType].filter(([, t]) => t === HR_CPU).map(([i]) => text(devDescr.get(i))).filter((x): x is string => !!x);
  // The chassis (class 3) is the device itself; otherwise take the first entry that has a serial number
  const chassis = [...entClass].find(([, c]) => c === 3)?.[0] ?? [...entSerial].find(([, v]) => text(v))?.[0];
  const ent = (m: Map<string, Val>) => (chassis ? text(m.get(chassis)) : null);

  const DISK_STATUS: Record<number, string> = { 1: 'Normal', 2: 'Initialized', 3: 'Not initialized', 4: 'System partition failed', 5: 'Crashed' };
  const disks = [...synoDisk].map(([i, m]) => {
    const st = num(synoStatus.get(i)), tmp = num(synoTemp.get(i));
    const detail = [text(synoType.get(i)), tmp !== null && tmp > 0 ? `${tmp} °C` : null, st === null ? null : DISK_STATUS[st] ?? `status ${st}`].filter(Boolean).join(' · ');
    return { model: text(m) ?? 'Unknown', detail: detail || null };
  });
  if (disks.length === 0) for (const [i, t] of devType) if (t === HR_DISK) { const d = text(devDescr.get(i)); if (d) disks.push({ model: d, detail: null }); }

  const ramKb = num(sys.get(OID.hrMemorySize));
  return {
    hostname: text(sys.get(OID.sysName)), description: text(sys.get(OID.sysDescr), 200), location: text(sys.get(OID.sysLocation)), contact: text(sys.get(OID.sysContact)),
    manufacturer: ent(entMfg) ?? (sys.has(OID.synoModel) ? 'Synology' : null), model: ent(entModel) ?? text(sys.get(OID.synoModel)), serial: ent(entSerial) ?? text(sys.get(OID.synoSerial)),
    firmware: ent(entSw) ?? ent(entFw) ?? text(sys.get(OID.synoVersion)),
    temperatureC: ((t) => (t !== null && t > 0 ? t : null))(num(sys.get(OID.synoSysTemp))), cpuModel: cpus[0] ?? null, cpuCount: cpus.length || null, ramTotalGb: ramKb ? Math.round((ramKb / 1048576) * 10) / 10 : null,
    disks: disks.slice(0, 16),
  };
}
