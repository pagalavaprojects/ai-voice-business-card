// Applies every file in supabase/migrations, in order, against a real
// Postgres engine (PGlite — Postgres compiled to WASM, no Docker/network
// required) and asserts basic schema-health invariants. This is a genuine
// syntax + apply-order check, not a mock: catches broken FKs, duplicate
// policy names, bad trigger references, etc. before they ever reach a live
// Supabase project.
//
// Known gap: this PGlite build does not bundle the `vector` extension, so
// pgvector-specific statements (embedding columns, ivfflat indexes, and any
// function whose signature takes a vector(1536) argument, e.g. the
// knowledge-search RPC) are stripped for this run only — they are not
// modified in the real migration files and still require a live Postgres
// with pgvector to confirm.
import { PGlite } from "@electric-sql/pglite";
import { uuid_ossp } from "@electric-sql/pglite/contrib/uuid_ossp";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

function stripVectorForHarnessOnly(sql) {
  return sql
    .replace(/CREATE EXTENSION IF NOT EXISTS vector;\n?/g, "")
    .replace(/^\s*embedding vector\(1536\),?\n/gm, "\n")
    .replace(/CREATE INDEX idx_knowledge_chunks_embedding[\s\S]*?;\n/g, "")
    // Any function whose signature references vector(1536) is inherently
    // untestable without the extension — drop the whole CREATE FUNCTION
    // statement for this run rather than mangling it into something that
    // silently verifies the wrong thing.
    .replace(/CREATE OR REPLACE FUNCTION [^;]*?vector\(1536\)[\s\S]*?\$\$;\n?/g, "");
}

const authStub = `
CREATE SCHEMA IF NOT EXISTS auth;
CREATE TABLE auth.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text,
  raw_user_meta_data jsonb DEFAULT '{}'::jsonb
);
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid AS $$
  SELECT NULL::uuid;
$$ LANGUAGE sql STABLE;
`;

async function run() {
  const db = new PGlite({ extensions: { uuid_ossp, pg_trgm, pgcrypto } });
  await db.exec(authStub);

  const dir = "supabase/migrations";
  const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();

  let failed = false;
  for (const f of files) {
    const path = join(dir, f);
    const sql = stripVectorForHarnessOnly(readFileSync(path, "utf8"));
    try {
      await db.exec(sql);
      console.log(`OK    ${f}`);
    } catch (err) {
      console.error(`FAIL  ${f}: ${err.message}`);
      failed = true;
      break;
    }
  }

  if (failed) {
    process.exit(1);
  }

  const permissive = await db.query("select tablename, policyname from pg_policies where qual = 'true'");
  const tables = await db.query("select count(*)::int as n from information_schema.tables where table_schema='public'");
  const policies = await db.query("select count(*)::int as n from pg_policies");
  const fks = await db.query(
    "select count(*)::int as n from information_schema.table_constraints where constraint_type='FOREIGN KEY' and table_schema='public'"
  );

  console.log(`\n${tables.rows[0].n} tables, ${policies.rows[0].n} RLS policies, ${fks.rows[0].n} foreign keys.`);

  if (permissive.rows.length > 0) {
    console.error(`\nFAIL: ${permissive.rows.length} permissive USING(true) polic${permissive.rows.length === 1 ? "y" : "ies"} remain:`);
    permissive.rows.forEach((r) => console.error(`  - ${r.tablename}.${r.policyname}`));
    process.exit(1);
  }

  console.log("PASS: all migrations applied cleanly, no permissive tenant policies remain.");
}

run().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
