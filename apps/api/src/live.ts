import type { IfaceInfo, Inventory, NetworkInfo, ProcessInfo, Volume } from '@pulse/shared';

/** The latest real readings for one monitored device (simulated devices use mock.ts instead). */
export interface Live {
  polled: boolean; misses: number; lastSeen: number | null; error: string | null;
  sysDescr: string | null; uptimeS: number | null;
  inventory: Inventory | null; inventoryAt: number;
  cpu: number | null; memory: number | null; disk: number | null;
  cores: number[]; volumes: Volume[]; interfaces: IfaceInfo[]; processes: ProcessInfo[]; network: NetworkInfo;
}
const store = new Map<string, Live>();
const fresh = (): Live => ({
  polled: false, misses: 0, lastSeen: null, error: null, sysDescr: null, uptimeS: null, inventory: null, inventoryAt: 0, cpu: null, memory: null, disk: null,
  cores: [], volumes: [], interfaces: [], processes: [], network: { downMbps: null, upMbps: null, latencyMs: null, lossPct: null, jitterMs: null },
});
export function getLive(id: string): Live {
  let l = store.get(id);
  if (!l) { l = fresh(); store.set(id, l); }
  return l;
}
export const resetLive = (id: string): void => { store.delete(id); };
