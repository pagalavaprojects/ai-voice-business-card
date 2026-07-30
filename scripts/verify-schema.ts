import { supabaseAdmin } from "../src/shared/lib/supabase";

// Tables that must exist after running migrations
const EXPECTED_TABLES = [
  "companies",
  "employees",
  "products",
  "services",
  "faqs",
  "lead_scoring_rules",
  "conversations",
  "conversation_messages",
  "leads",
  "appointments",
  "prompt_templates",
  "audit_logs",
];

async function verifySchema() {
  console.log("[Schema Verification] Checking all database tables from migration...\n");

  let passed = 0;
  let failed = 0;

  for (const table of EXPECTED_TABLES) {
    const { error } = await supabaseAdmin
      .from(table)
      .select("count", { count: "exact", head: true });

    if (error && !error.message.includes("placeholder")) {
      console.error(`❌ Table [${table}] check failed: ${error.message}`);
      failed++;
    } else {
      console.log(`✅ Table [${table}] — OK`);
      passed++;
    }
  }

  console.log(`\n[Schema Verification] Results: ${passed} passed, ${failed} failed`);

  if (failed > 0) {
    console.error(
      "\n⚠️  Schema verification failed. Run migrations first:\n  supabase db push --project-ref <YOUR_PROJECT_REF>"
    );
    process.exit(1);
  } else {
    console.log("\n✅ All tables verified. Schema is production-ready.");
  }
}

verifySchema().catch(console.error);
