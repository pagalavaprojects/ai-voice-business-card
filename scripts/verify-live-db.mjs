/**
 * Verifies the LIVE Supabase project actually matches what the app expects:
 * every table the code reads/writes exists, the seeded card is complete, and
 * there are no duplicate rows from repeated seed runs.
 *
 * Complements verify-migrations.mjs, which only proves the SQL *applies* (to a
 * local PGlite instance). This proves the deployed database is really correct.
 *
 * Usage: node --env-file=.env.local scripts/verify-live-db.mjs
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key || url.includes("placeholder")) {
  console.error("FAIL: Supabase env vars missing or still placeholders.");
  console.error("Run with: node --env-file=.env.local scripts/verify-live-db.mjs");
  process.exit(1);
}

const db = createClient(url, key, { auth: { persistSession: false } });

const COMPANY_ID = "33333333-3333-3333-3333-333333333333";
const EMPLOYEE_ID = "44444444-4444-4444-4444-444444444444";

// Every table the application actually reads or writes at runtime.
const REQUIRED_TABLES = [
  "companies", "employees", "products", "services", "faqs",
  "conversations", "conversation_messages", "leads", "lead_activities",
  "appointments", "prompt_templates", "prompt_template_versions",
  "audit_logs", "ai_agents", "agent_knowledge_documents",
  "knowledge_documents", "knowledge_chunks", "users", "company_members",
  "branding", "settings", "api_keys", "email_logs",
];

let failures = 0;
const fail = (msg) => { console.error(`  FAIL  ${msg}`); failures++; };
const pass = (msg) => console.log(`  ok    ${msg}`);

console.log("\n[1/4] Required tables reachable");
for (const table of REQUIRED_TABLES) {
  const { error } = await db.from(table).select("*", { count: "exact", head: true });
  if (error) fail(`${table} — ${error.message}`);
  else pass(table);
}

console.log("\n[2/4] pgvector search RPC present");
{
  // Must be called with the real signature: PostgREST resolves overloads by
  // argument names, so an empty-args probe reports "could not find the
  // function ... without parameters" even when the function exists perfectly.
  // A zero-vector query is a valid call that simply matches nothing.
  const { error } = await db.rpc("match_knowledge_chunks", {
    target_company_id: COMPANY_ID,
    query_embedding: Array(1536).fill(0),
    match_count: 1,
  });
  if (error) fail(`match_knowledge_chunks RPC — ${error.message}`);
  else pass("match_knowledge_chunks (pgvector cosine search callable)");
}

console.log("\n[3/4] Seeded business card is complete");
{
  const checks = [
    ["company", db.from("companies").select("id,name").eq("id", COMPANY_ID)],
    ["employee", db.from("employees").select("id,name").eq("id", EMPLOYEE_ID)],
    ["services", db.from("services").select("id").eq("company_id", COMPANY_ID)],
    ["faqs", db.from("faqs").select("id").eq("company_id", COMPANY_ID)],
    ["prompt_templates", db.from("prompt_templates").select("id,module_name").eq("company_id", COMPANY_ID)],
    ["ai_agents", db.from("ai_agents").select("id,first_message,voice_model_id").eq("company_id", COMPANY_ID)],
  ];
  for (const [label, query] of checks) {
    const { data, error } = await query;
    if (error) fail(`${label} — ${error.message}`);
    else if (!data || data.length === 0) fail(`${label} — no rows (run: npm run seed:pagalava)`);
    else pass(`${label} (${data.length} row${data.length === 1 ? "" : "s"})`);
  }

  const { data: agent } = await db.from("ai_agents").select("first_message,voice_model_id").eq("company_id", COMPANY_ID).maybeSingle();
  if (!agent?.first_message) fail("agent.first_message empty — the card would speak the generic fallback greeting");
  else pass(`agent.first_message set (${agent.first_message.split(/\s+/).length} words)`);
  if (!agent?.voice_model_id) fail("agent.voice_model_id empty");
  else pass(`agent.voice_model_id = ${agent.voice_model_id}`);

  const { data: modules } = await db.from("prompt_templates").select("module_name").eq("company_id", COMPANY_ID);
  const found = new Set((modules || []).map((m) => m.module_name));
  for (const required of ["identity", "behavior", "sales", "booking", "security", "fallback"]) {
    if (found.has(required)) pass(`prompt module: ${required}`);
    else fail(`prompt module missing: ${required}`);
  }
}

console.log("\n[4/4] No duplicate rows from repeated seed runs");
for (const [table, column] of [["faqs", "question"], ["services", "name"], ["prompt_templates", "module_name"]]) {
  const { data, error } = await db.from(table).select(column).eq("company_id", COMPANY_ID);
  if (error) { fail(`${table} — ${error.message}`); continue; }
  const values = (data || []).map((r) => r[column]);
  const dupes = values.filter((v, i) => values.indexOf(v) !== i);
  if (dupes.length > 0) fail(`${table} has duplicates: ${[...new Set(dupes)].join(", ")}`);
  else pass(`${table} — ${values.length} unique`);
}

console.log(
  failures === 0
    ? "\nPASS: live database matches what the application expects.\n"
    : `\nFAIL: ${failures} problem(s) found against the live database.\n`
);
process.exit(failures === 0 ? 0 : 1);
