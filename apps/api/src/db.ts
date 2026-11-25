import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { config } from './config';

export const pool = new pg.Pool({ connectionString: config.DATABASE_URL });

export async function waitForDb(): Promise<void> {
  let last = '';
  for (let i = 1; i <= 30; i++) {
    try {
      await pool.query('select 1');
      return;
    } catch (err) {
      last = (err as Error).message || String(err);
      if (i === 1 || i % 5 === 0) console.log(`Waiting for the database (try ${i}/30): ${last}`);
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  const hint = /password authentication/i.test(last)
    ? ' The password in .env does not match the one the database volume was created with. On a fresh install run: docker compose down -v, then docker compose up -d --build.'
    : ' Check that the db container is running (docker compose logs db).';
  throw new Error(`The database is not reachable: ${last}.${hint}`);
}

/** TimescaleDB wants CREATE EXTENSION as the first command of a fresh session, so it gets its own connection. */
async function ensureExtensions(): Promise<void> {
  const client = new pg.Client({ connectionString: config.DATABASE_URL });
  await client.connect();
  try {
    await client.query('create extension if not exists timescaledb');
  } catch (err) {
    throw new Error(`Could not enable the TimescaleDB extension: ${(err as Error).message}. Use the timescale/timescaledb image for the database.`);
  } finally {
    await client.end();
  }
}

/** Applies any new .sql files in apps/api/migrations, in name order. Safe to run on every start. */
export async function migrate(): Promise<void> {
  await ensureExtensions();
  await pool.query(
    'create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())',
  );
  const dir = process.env.MIGRATIONS_DIR ?? path.join(path.dirname(fileURLToPath(import.meta.url)), '../migrations');
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
    const done = await pool.query('select 1 from schema_migrations where name = $1', [file]);
    if (done.rowCount) continue;
    const client = await pool.connect();
    try {
      await client.query('begin');
      await client.query(fs.readFileSync(path.join(dir, file), 'utf8'));
      await client.query('insert into schema_migrations (name) values ($1)', [file]);
      await client.query('commit');
      console.log(`Applied migration ${file}`);
    } catch (err) {
      await client.query('rollback');
      throw err;
    } finally {
      client.release();
    }
  }
}
