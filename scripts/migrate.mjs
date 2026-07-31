/**
 * Applies every migration in supabase/migrations to a real Postgres database,
 * in filename order, exactly once each.
 *
 * This is the production path referenced by `npm run migrate`. It is distinct
 * from `verify:migrations`, which only proves the SQL parses and applies to a
 * throwaway in-process PGlite instance — useful in CI, but it never touches
 * the real database.
 *
 * Applied migrations are recorded in a `schema_migrations` table, so re-running
 * is safe and only pending files execute. Each file runs inside a transaction:
 * a failure rolls that file back rather than leaving the schema half-applied.
 *
 * Requires DATABASE_URL — Supabase Dashboard → Project Settings → Database →
 * Connection string → URI (this is NOT the anon/service_role API key; DDL
 * cannot be executed through the REST API).
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";

const MIGRATIONS_DIR = "supabase/migrations";
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error("FAIL: DATABASE_URL is not set.\n");
  console.error("  Supabase Dashboard -> Project Settings -> Database -> Connection string -> URI");
  console.error("  Then: DATABASE_URL=\"postgresql://...\" npm run migrate");
  console.error("  (or add it to .env.local — npm run migrate loads that file)\n");
  process.exit(1);
}

// Supabase requires TLS but serves a certificate chain Node won't verify by
// default from a developer machine. Verification is relaxed only for this
// short-lived admin connection, never for application traffic.
const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });

try {
  await client.connect();
} catch (err) {
  console.error(`FAIL: could not connect to the database — ${err.message}`);
  process.exit(1);
}

await client.query(`
  CREATE TABLE IF NOT EXISTS schema_migrations (
    filename    TEXT PRIMARY KEY,
    applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
`);

const { rows } = await client.query("SELECT filename FROM schema_migrations");
const alreadyApplied = new Set(rows.map((r) => r.filename));

const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort();
const pending = files.filter((f) => !alreadyApplied.has(f));

if (pending.length === 0) {
  console.log(`\nUp to date — all ${files.length} migration(s) already applied.\n`);
  await client.end();
  process.exit(0);
}

console.log(`\n${pending.length} pending migration(s) of ${files.length} total:\n`);

let failed = false;
for (const filename of pending) {
  const sql = readFileSync(join(MIGRATIONS_DIR, filename), "utf8");
  try {
    await client.query("BEGIN");
    await client.query(sql);
    await client.query("INSERT INTO schema_migrations (filename) VALUES ($1)", [filename]);
    await client.query("COMMIT");
    console.log(`  applied  ${filename}`);
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(`  FAILED   ${filename}`);
    console.error(`           ${err.message}`);
    failed = true;
    // Stop on first failure: later migrations almost always depend on earlier
    // ones, so continuing would produce a cascade of misleading errors.
    break;
  }
}

await client.end();

if (failed) {
  console.error("\nFAIL: migration aborted and rolled back. Fix the error above and re-run.\n");
  process.exit(1);
}

console.log(`\nPASS: ${pending.length} migration(s) applied.\n`);
