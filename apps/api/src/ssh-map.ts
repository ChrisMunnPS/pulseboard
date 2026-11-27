import type { IfaceInfo, Inventory, ProcessInfo, ServiceInfo, Volume } from '@pulse/shared';
import type { InventoryDoc, Metrics } from './collector-schema';

const pct = (part: number, whole: number) => (whole > 0 ? Math.min(100, Math.max(0, Math.round((part / whole) * 100))) : null);

export function fromMetrics(m: Metrics) {
  const volumes: Volume[] = m.volumes.filter((v) => v.sizeBytes && v.sizeBytes > 0 && v.freeBytes !== null).map((v) => ({
    mount: `${v.mount}${v.label ? ` ${v.label}` : ''}`.slice(0, 48), usedPct: pct((v.sizeBytes as number) - (v.freeBytes as number), v.sizeBytes as number) ?? 0, smart: null, lifePct: null, sizeBytes: v.sizeBytes,
  }));
  const interfaces: IfaceInfo[] = m.network.map((n, i) => ({ index: i, name: n.name.slice(0, 40), alias: n.mac ?? '', up: n.up, speedMbps: n.speedMbps === null ? null : Math.round(n.speedMbps), inBps: n.inBps === null ? null : Math.round(n.inBps * 8), outBps: n.outBps === null ? null : Math.round(n.outBps * 8) }));
  const processes: ProcessInfo[] = m.processes.map((p) => ({ pid: p.pid, name: p.name, cpu: p.cpuPct === null ? null : Math.round(p.cpuPct * 10) / 10, memGb: Math.round(((p.memBytes ?? 0) / 1024 ** 3) * 100) / 100 }));
  const services: ServiceInfo[] = m.services.map((s) => ({ name: s.name, display: s.display, state: s.state, startType: s.startType }));
  return {
    cpu: m.cpu.loadPct === null ? null : Math.round(m.cpu.loadPct), cores: m.cpu.perCore.map(Math.round),
    memory: m.memory.totalBytes && m.memory.usedBytes !== null ? pct(m.memory.usedBytes, m.memory.totalBytes) : null,
    disk: volumes.length ? Math.max(...volumes.map((v) => v.usedPct)) : null,
    volumes, interfaces, processes, services, uptimeS: m.uptimeS === null ? null : Math.round(m.uptimeS), sysDescr: m.os,
  };
}

export function fromInventory(d: InventoryDoc): Inventory {
  const s = d.system;
  return {
    hostname: d.hostname, description: d.osName, location: null, contact: null,
    manufacturer: s.manufacturer, model: s.model, serial: s.serial, firmware: s.biosVersion,
    cpuModel: d.cpu.model, cpuCount: d.cpu.threads ?? d.cpu.cores, ramTotalGb: d.memory.totalBytes ? Math.round((d.memory.totalBytes / 1024 ** 3) * 10) / 10 : null, temperatureC: null,
    disks: d.disks.map((x) => ({ model: x.model ?? 'Unknown', detail: [x.mediaType, x.health, x.tempC !== null ? `${x.tempC} °C` : null].filter(Boolean).join(' · ') || null, serial: x.serial, sizeBytes: x.sizeBytes, mediaType: x.mediaType })),
    osName: d.osName, osBuild: d.osBuild, biosVersion: s.biosVersion, biosDate: s.biosDate, boardManufacturer: s.boardManufacturer, boardModel: s.boardModel, boardSerial: s.boardSerial,
    ramModules: d.ramModules, gpus: d.gpus.map((g) => ({ name: g.name, driver: g.driver, vramBytes: g.vramBytes })), apps: d.apps,
  };
}
