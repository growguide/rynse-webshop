// Applies db/migrations/*.sql in order (shared by tools/migrate.js and the admin migrate endpoint).
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'db', 'migrations');

export async function runMigrations(sql) {
  await sql.unsafe('CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
  const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();
  const applied = [];
  for (const f of files) {
    const [done] = await sql`SELECT 1 FROM schema_migrations WHERE name = ${f}`;
    if (done) continue;
    const body = await readFile(path.join(dir, f), 'utf8');
    await sql.begin(async (tx) => {
      await tx.unsafe(body);
      await tx`INSERT INTO schema_migrations (name) VALUES (${f})`;
    });
    applied.push(f);
  }
  return { applied, total: files.length };
}
