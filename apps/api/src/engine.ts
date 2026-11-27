import type { AlertRule, RuleKey, Severity } from '@pulse/shared';
import { pool } from './db';
import { metricsOf } from './views';
import type { DeviceRow } from './types';
import { dispatch } from './notify';

export const RULE_META: Record<RuleKey, { name: string; unit: string; live: boolean }> = {
  cpu: { name: 'High CPU', unit: '% CPU', live: true },
  memory: { name: 'High memory', unit: '% RAM used', live: true },
  disk: { name: 'Low disk space', unit: '% disk used', live: true },
  offline: { name: 'Device offline', unit: '', live: true },
  service: { name: 'Service failure', unit: 'failed services', live: true },
  temperature: { name: 'High temperature', unit: '°C', live: true },
  smart: { name: 'Drive health', unit: 'failing drives', live: true },
};

interface Rule { key: RuleKey; threshold: number; durationS: number; severity: Severity; enabled: boolean }

let rules: Rule[] = [];
const breachSince = new Map<string, number>();
const open = new Set<string>();
let log: (m: string) => void = console.log;

export async function loadRules(): Promise<AlertRule[]> {
  const { rows } = await pool.query('select key, threshold, duration_s, severity, enabled from alert_rules');
  rules = rows.map((r) => ({ key: r.key, threshold: r.threshold, durationS: r.duration_s, severity: r.severity, enabled: r.enabled }));
  return rules.map((r) => ({ ...r, ...RULE_META[r.key] }));
}

export async function startEngine(logger: (m: string) => void): Promise<void> {
  log = logger;
  await loadRules();
  const { rows } = await pool.query("select device_id, rule_key from alerts where state <> 'resolved' and rule_key is not null");
  for (const r of rows) open.add(`${r.device_id}:${r.rule_key}`);
}

function measure(rule: Rule, d: DeviceRow): { breach: boolean; detail: string } | null {
  const m = metricsOf(d);
  if (rule.key === 'offline') return { breach: m.status === 'offline', detail: 'No response from the device' };
  if (m.status === 'offline' || m.status === 'unknown') return { breach: false, detail: '' };
  const pct = (v: number | null, label: string) => (v === null ? null : { breach: v > rule.threshold, detail: `${label} at ${Math.round(v)}% (limit ${rule.threshold}%)` });
  switch (rule.key) {
    case 'cpu': return pct(m.cpu, 'CPU');
    case 'memory': return pct(m.memory, 'Memory');
    case 'disk': return pct(m.disk, 'Disk');
    case 'service': return { breach: m.failed.length > 0 && m.failed.length >= rule.threshold, detail: `Failed: ${m.failed.join(', ')}` };
    case 'temperature': return m.temperature === null ? null : { breach: m.temperature > rule.threshold, detail: `Hottest sensor at ${m.temperature} °C (limit ${rule.threshold} °C)` };
    case 'smart': return !m.hasDriveData ? null : { breach: m.driveIssues.length >= Math.max(1, rule.threshold), detail: `Drive problem: ${m.driveIssues.join(', ')}` };
    default: return null;
  }
}

/** Called after every 5-second tick: opens an alert once a breach has lasted long enough, resolves it on recovery. */
export async function evaluate(fleet: DeviceRow[], now = Date.now()): Promise<void> {
  for (const rule of rules) {
    for (const d of fleet) {
      const id = `${d.id}:${rule.key}`;
      const m = rule.enabled && RULE_META[rule.key].live ? measure(rule, d) : null;
      if (m?.breach) {
        if (!breachSince.has(id)) breachSince.set(id, now);
        if (!open.has(id) && now - (breachSince.get(id) ?? now) >= rule.durationS * 1000) {
          const res = await pool.query(
            'insert into alerts (device_id, severity, title, detail, rule_key) values ($1,$2,$3,$4,$5) on conflict do nothing returning id',
            [d.id, rule.severity, RULE_META[rule.key].name, m.detail, rule.key],
          );
          open.add(id);
          if (res.rowCount) void dispatch({ severity: rule.severity, title: RULE_META[rule.key].name, detail: m.detail, device: d.name, at: new Date().toISOString() }, log);
        }
      } else {
        breachSince.delete(id);
        if (open.has(id)) {
          await pool.query("update alerts set state = 'resolved', resolved_at = now() where device_id = $1 and rule_key = $2 and state <> 'resolved'", [d.id, rule.key]);
          open.delete(id);
        }
      }
    }
  }
}
