import { z } from 'zod';

export const ROLES = ['owner', 'admin', 'operator', 'viewer', 'auditor'] as const;
export type Role = (typeof ROLES)[number];

export type DeviceStatus = 'healthy' | 'warning' | 'critical' | 'offline' | 'unknown';
export const DEVICE_TYPES = ['computer', 'server', 'router', 'switch', 'firewall', 'access-point', 'nas', 'other'] as const;
export type DeviceType = (typeof DEVICE_TYPES)[number];
/** simulated = made-up numbers (demo); ping and tcp = reachability only; snmp = real readings over SNMP */
export type Monitor = 'simulated' | 'ping' | 'tcp' | 'snmp';
export const OS_CHOICES = ['Windows', 'Windows Server', 'Linux', 'macOS', 'Network device', 'NAS', 'Other'] as const;
export type Severity = 'critical' | 'warning' | 'info';

export interface Device {
  id: string;
  name: string;
  os: string;
  address: string;
  type: DeviceType;
  monitor: Monitor;
  status: DeviceStatus;
  health: number;
  /** null = this device (or monitoring method) does not report it */
  cpu: number | null;
  memory: number | null;
  disk: number | null;
  latencyMs: number | null;
}

export interface Alert {
  id: string;
  severity: Severity;
  title: string;
  detail: string;
  deviceId: string | null;
  deviceName: string | null;
  state: 'open' | 'acked' | 'resolved';
  openedAt: string;
}

export interface FleetTick {
  type: 'tick';
  at: string;
  devices: Pick<Device, 'id' | 'status' | 'health' | 'cpu' | 'memory' | 'disk' | 'latencyMs'>[];
}

export const LoginBody = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

/** Who may do what. Mirrors the RBAC matrix in the design document. */
export const PERMISSIONS = {
  'devices:read': ['owner', 'admin', 'operator', 'viewer', 'auditor'],
  'alerts:ack': ['owner', 'admin', 'operator'],
  'service:restart': ['owner', 'admin', 'operator'],
  'machine:power': ['owner', 'admin', 'operator'],
  'process:kill': ['owner', 'admin', 'operator'],
  'device:manage': ['owner', 'admin'],
  'settings:manage': ['owner', 'admin'],
  'users:manage': ['owner'],
  'audit:read': ['owner', 'admin', 'auditor'],
} as const satisfies Record<string, readonly Role[]>;

export type Permission = keyof typeof PERMISSIONS;

export const can = (role: Role, permission: Permission): boolean =>
  (PERMISSIONS[permission] as readonly Role[]).includes(role);

export interface Volume { mount: string; usedPct: number; smart: 'OK' | 'Warning' | null; lifePct: number | null; sizeBytes: number | null }
export interface ServiceInfo { name: string; state: 'Running' | 'Stopped' | 'Failed' }
export interface ProcessInfo { pid: number; name: string; cpu: number | null; memGb: number }
export interface NetworkInfo { downMbps: number | null; upMbps: number | null; latencyMs: number | null; lossPct: number | null; jitterMs: number | null }
export interface IfaceInfo { index: number; name: string; alias: string; up: boolean | null; speedMbps: number | null; inBps: number | null; outBps: number | null }

export type SnmpLevel = 'noAuthNoPriv' | 'authNoPriv' | 'authPriv';
export interface MonitorInfo {
  monitor: Monitor; port: number | null;
  snmpVersion: 'v2c' | 'v3' | null; username: string | null; securityLevel: SnmpLevel | null;
  authProtocol: string | null; privProtocol: string | null;
  /** true when credentials are saved (they are never sent back) */
  hasSecret: boolean;
  lastError: string | null; sysDescr: string | null; uptimeS: number | null; lastSeen: string | null;
}

export interface DiskInfo { model: string; detail: string | null }
/** Hardware details. Every field is null when the device does not report it over the chosen protocol. */
export interface Inventory {
  hostname: string | null; description: string | null; location: string | null; contact: string | null;
  manufacturer: string | null; model: string | null; serial: string | null; firmware: string | null;
  cpuModel: string | null; cpuCount: number | null; ramTotalGb: number | null; temperatureC: number | null; disks: DiskInfo[];
}

export interface DeviceDetail extends Device {
  inventory: Inventory | null;
  monitorInfo: MonitorInfo;
  cores: number[];
  volumes: Volume[];
  network: NetworkInfo;
  interfaces: IfaceInfo[];
  processes: ProcessInfo[];
  services: ServiceInfo[];
}

const Address = z.string().trim().min(1).max(255).regex(/^[A-Za-z0-9._:-]+$/, 'Use an IP address or hostname, for example 10.0.0.1 or router.lan.').refine((a) => !a.startsWith('-'), 'The address cannot start with a dash.');
const Key = z.string().max(128);
export const SnmpInput = z.object({
  version: z.enum(['v2c', 'v3']),
  port: z.coerce.number().int().min(1).max(65535).default(161),
  community: Key.optional(),
  username: z.string().trim().max(64).optional(),
  securityLevel: z.enum(['noAuthNoPriv', 'authNoPriv', 'authPriv']).optional(),
  authProtocol: z.enum(['sha', 'sha256', 'sha512']).optional(),
  authKey: Key.optional(),
  privProtocol: z.enum(['aes', 'aes256b']).optional(),
  privKey: Key.optional(),
});
export type SnmpInput = z.infer<typeof SnmpInput>;
export const DeviceInput = z.object({
  name: z.string().trim().min(1).max(60),
  address: Address,
  type: z.enum(DEVICE_TYPES),
  os: z.enum(OS_CHOICES),
  monitor: z.enum(['ping', 'tcp', 'snmp']),
  port: z.coerce.number().int().min(1).max(65535).optional(),
  snmp: SnmpInput.optional(),
});
export type DeviceInput = z.infer<typeof DeviceInput>;

export const SEVERITY_RANK: Record<Severity, number> = { info: 0, warning: 1, critical: 2 };
export const PASSWORD_MIN = 12;

export type RuleKey = 'cpu' | 'memory' | 'disk' | 'offline' | 'service' | 'temperature' | 'smart';
export interface AlertRule {
  key: RuleKey; name: string; unit: string; threshold: number; durationS: number;
  severity: Severity; enabled: boolean;
  /** false = needs real collectors, so the simulated data cannot trigger it yet */
  live: boolean;
}

export type ChannelType = 'email' | 'teams' | 'slack' | 'discord' | 'webhook';
export interface Channel {
  id: string; type: ChannelType; name: string; enabled: boolean; minSeverity: Severity;
  config: Record<string, string | number | boolean>;
  /** Never the secret itself: the host of a webhook URL, or "password set" for email. */
  secretHint: string | null;
}

export interface UserRow { id: string; email: string; role: Role; disabled: boolean; createdAt: string }
export interface AuditRow { id: number; at: string; actor: string | null; action: string; target: string | null; result: string }
