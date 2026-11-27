import type { ZodType } from 'zod';
import { InventoryDoc, Metrics } from './collector-schema';
import type { Live } from './live';
import { fromInventory, fromMetrics } from './ssh-map';
import { runCollector, type SshTarget } from './ssh-run';
import type { DeviceRow } from './types';
import { vault } from './vault-instance';

export function sshTargetOf(row: Pick<DeviceRow, 'address' | 'monitor_config' | 'monitor_secret_enc'>): SshTarget {
  const c = row.monitor_config as { port?: number; username?: string; hostKey?: string };
  const secret = row.monitor_secret_enc ? (JSON.parse(vault.open(row.monitor_secret_enc)) as { privateKey?: string }) : {};
  return { host: row.address, port: c.port ?? 22, username: c.username ?? '', privateKey: secret.privateKey ?? '', pinned: c.hostKey ?? null };
}

export function parseDoc<T>(schema: ZodType<T>, text: string): T {
  if (!text.trim()) throw new Error('The device returned nothing. Check that authorized_keys forces the Pulseboard collector command for this key.');
  try { return schema.parse(JSON.parse(text)); }
  catch { throw new Error('The collector returned unexpected data. Make sure the collector script on the device is the one that came with this version of Pulseboard.'); }
}

const MIN_INTERVAL_MS = 55_000; // collecting over SSH is heavier than ping or SNMP, so it runs about once a minute
const INVENTORY_EVERY_MS = 3_600_000;

/** Returns false when it was skipped because the device was collected very recently. */
export async function collectSsh(row: DeviceRow, l: Live, force: boolean): Promise<boolean> {
  if (!force && Date.now() - l.sshAt < MIN_INTERVAL_MS) return false;
  const target = sshTargetOf(row);
  const m = fromMetrics(parseDoc(Metrics, (await runCollector(target, 'metrics')).stdout));
  Object.assign(l, { cpu: m.cpu, cores: m.cores, memory: m.memory, disk: m.disk, volumes: m.volumes, interfaces: m.interfaces, processes: m.processes, services: m.services, uptimeS: m.uptimeS, sysDescr: m.sysDescr });
  l.sshAt = Date.now();
  if (!l.inventory || Date.now() - l.inventoryAt > INVENTORY_EVERY_MS) {
    l.inventoryAt = Date.now(); // a failed inventory is not retried every minute
    try { l.inventory = fromInventory(parseDoc(InventoryDoc, (await runCollector(target, 'inventory')).stdout)); } catch { /* metrics still count */ }
  }
  return true;
}
