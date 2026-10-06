#!/usr/bin/env node
// Applies db/migrations/*.sql in order. Usage: node tools/migrate.js [--reset]
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getSql, closeSql } from '../src/server/db.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const dir = path.join(here, '..', 'db', 'migrations');
const reset = process.argv.includes('--reset');

const sql = getSql();
try {
  if (reset) {
    if (process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production') {
      throw new Error('Refusing to --reset a production database');
    }
    await sql.unsafe('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    console.log('Schema dropped.');
  }
  await sql.unsafe('CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
  const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();
  for (const f of files) {
    const [done] = await sql`SELECT 1 FROM schema_migrations WHERE name = ${f}`;
    if (done) continue;
    const body = await readFile(path.join(dir, f), 'utf8');
    await sql.begin(async (tx) => {
      await tx.unsafe(body);
      await tx`INSERT INTO schema_migrations (name) VALUES (${f})`;
    });
    console.log('Applied', f);
  }
  console.log('Migrations up to date.');
} finally {
  await closeSql();
}
