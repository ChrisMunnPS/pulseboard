import type { Monitor } from '@pulse/shared';

// Always icon + words, and "simulated" is deliberately conspicuous so demo numbers are never mistaken for real ones.
const MAP: Record<Monitor, [string, string, string]> = {
  simulated: ['◌', 'Simulated data', 'text-warn'],
  ping: ['●', 'Live: ping', 'text-ok'],
  tcp: ['●', 'Live: TCP port', 'text-ok'],
  snmp: ['●', 'Live: SNMP', 'text-ok'],
  ssh: ['●', 'Live: SSH', 'text-ok'],
};
export default function SourceBadge({ monitor }: { monitor: Monitor }) {
  const [icon, label, color] = MAP[monitor];
  return <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-current px-2 text-xs ${color}`}><span aria-hidden="true">{icon}</span>{label}</span>;
}
