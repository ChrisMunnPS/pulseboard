export default function Bar({ value, warn = 70, crit = 90, label }: { value: number; warn?: number; crit?: number; label: string }) {
  const color = value >= crit ? 'bg-crit' : value >= warn ? 'bg-warn' : 'bg-accent';
  return (
    <div className="flex items-center gap-2" role="img" aria-label={`${label} ${value} percent`}>
      <div className="h-2 w-20 flex-1 overflow-hidden rounded bg-raised"><div className={`h-full ${color}`} style={{ width: `${value}%` }} /></div>
      <span className="w-9 text-right text-sm">{value}%</span>
    </div>
  );
}
