// Postgres access. Uses the vendored, dependency-free `postgres` driver
// (vendor/postgres, public domain). One lazily created pool per process —
// on Vercel that means one small pool per warm function instance.
import postgres from '../../vendor/postgres/index.js';

let sql = null;

export function getSql() {
  if (sql) return sql;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  const isLocal = /localhost|127\.0\.0\.1/.test(url);
  sql = postgres(url, {
    max: Number.parseInt(process.env.DATABASE_POOL_MAX || '3', 10),
    idle_timeout: 20,
    connect_timeout: 10,
    ssl: isLocal ? false : (process.env.DATABASE_SSL === 'false' ? false : 'require'),
    prepare: process.env.DATABASE_PREPARE === 'true', // off by default: works with PgBouncer/Neon pooler
    transform: { undefined: null },
    onnotice: () => {},
  });
  return sql;
}

export async function closeSql() {
  if (sql) {
    const s = sql;
    sql = null;
    await s.end({ timeout: 2 });
  }
}

/** Run `fn` inside a transaction. */
export function transaction(fn) {
  return getSql().begin(fn);
}
