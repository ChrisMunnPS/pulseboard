// Status is always icon + word + colour, never colour alone.
const MAP = {
  healthy: ['●', 'Healthy', 'text-ok'],
  warning: ['▲', 'Warning', 'text-warn'],
  critical: ['✖', 'Critical', 'text-crit'],
  offline: ['○', 'Offline', 'text-muted'],
  unknown: ['◌', 'Checking', 'text-muted'],
  info: ['ℹ', 'Info', 'text-accent'],
} as const;

export default function StatusPill({ status, large }: { status: keyof typeof MAP; large?: boolean }) {
  const [icon, label, color] = MAP[status];
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-current ${large ? 'px-3 py-0.5 text-base' : 'px-2 text-xs'} ${color}`}>
      <span aria-hidden="true">{icon}</span>
      {label}
    </span>
  );
}
