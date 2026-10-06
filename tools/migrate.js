#!/usr/bin/env node
// Applies db/migrations/*.sql in order. Usage: node tools/migrate.js [--reset]
import { getSql, closeSql } from '../src/server/db.js';
import { runMigrations } from '../src/server/migrate.js';
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
  const { applied } = await runMigrations(sql);
  for (const f of applied) console.log('Applied', f);
  console.log('Migrations up to date.');
} finally {
  await closeSql();
}
