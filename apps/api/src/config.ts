import { z } from 'zod';

const req = (message: string) => z.string({ error: message }).min(1, message);

const Env = z.object({
  DATABASE_URL: req('DATABASE_URL is missing (docker compose sets it for you).'),
  JWT_SECRET: req('JWT_SECRET is missing. Run ./setup.sh (or setup.ps1) to create .env.').min(
    32,
    'JWT_SECRET must be at least 32 characters.',
  ),
  ADMIN_EMAIL: z.string().email().default('admin@example.com'),
  ADMIN_PASSWORD: req('ADMIN_PASSWORD is missing. Run ./setup.sh (or setup.ps1) to create .env.').min(
    12,
    'ADMIN_PASSWORD must be at least 12 characters.',
  ),
  SEED_DEMO: z.enum(['true', 'false']).default('false'),
  CORS_ORIGIN: z.string().default('*'),
  POLL_SECONDS: z.coerce.number().int().min(10).max(300).default(30),
  TRUST_PROXY: z.enum(['true', 'false']).default('false'),
  PORT: z.coerce.number().default(4000),
});

const parsed = Env.safeParse(process.env);
if (!parsed.success) {
  console.error('\nPulseboard cannot start because of a configuration problem:');
  for (const issue of parsed.error.issues) console.error(`  - ${issue.message}`);
  console.error('');
  process.exit(1);
}
export const config = parsed.data;
