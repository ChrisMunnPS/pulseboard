import type { Config } from 'tailwindcss';

// All theme tokens live in app/globals.css as CSS variables; Tailwind just maps names to them.
export default {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: 'var(--bg)', surface: 'var(--surface)', raised: 'var(--raised)', line: 'var(--border)',
        ink: 'var(--text)', muted: 'var(--muted)', accent: 'var(--accent)', 'on-accent': 'var(--on-accent)',
        ok: 'var(--ok)', warn: 'var(--warn)', crit: 'var(--crit)',
      },
      fontFamily: { sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'] },
    },
  },
  plugins: [],
} satisfies Config;
