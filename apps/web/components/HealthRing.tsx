'use client';
import { motion } from 'framer-motion';

export default function HealthRing({ score }: { score: number }) {
  const R = 52;
  const C = 2 * Math.PI * R;
  const color = score >= 85 ? 'var(--ok)' : score >= 60 ? 'var(--warn)' : 'var(--crit)';
  return (
    <svg viewBox="0 0 130 130" className="h-32 w-32 shrink-0" role="img" aria-label={`Health score ${score} percent`}>
      <circle cx="65" cy="65" r={R} fill="none" stroke="var(--raised)" strokeWidth="12" />
      <motion.circle
        cx="65" cy="65" r={R} fill="none" stroke={color} strokeWidth="12" strokeLinecap="round"
        transform="rotate(-90 65 65)" initial={false}
        animate={{ strokeDasharray: `${(C * score) / 100} ${C}` }} transition={{ duration: 0.6 }}
      />
      <text x="65" y="74" textAnchor="middle" fill="var(--text)" fontSize="28" fontWeight="700">{score}%</text>
    </svg>
  );
}
