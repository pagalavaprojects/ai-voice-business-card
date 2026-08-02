import { createClient } from "@supabase/supabase-js";

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const COMPANY_ID = "33333333-3333-3333-3333-333333333333";

// Fixed ids so re-running upserts rather than accumulating duplicates —
// the same idempotency rule as scripts/seed-pagalava.ts.
const products = [
  {
    id: "aaaaaaaa-0000-4000-8000-000000000001",
    company_id: COMPANY_ID,
    name: "AI Starter",
    slug: "ai-starter",
    sku: "PAG-START",
    category: "Subscription",
    short_description: "One automated workflow, live in two weeks.",
    description:
      "Entry tier of the plug-and-play AI department: one production workflow automated end to end, integrated with your existing systems, with ongoing monitoring.",
    features: ["1 automated workflow", "System integration", "Monthly review"],
    benefits: ["Fast time to value", "No in-house AI hire"],
    pricing: 1500,
    currency: "USD",
    discount_percent: 0,
    display_order: 1,
    is_featured: false,
    is_active: true,
  },
  {
    id: "aaaaaaaa-0000-4000-8000-000000000002",
    company_id: COMPANY_ID,
    name: "AI Department",
    slug: "ai-department",
    sku: "PAG-DEPT",
    category: "Subscription",
    short_description: "Your full plug-and-play AI department, on subscription.",
    description:
      "Complete AI department as a service: strategy, unlimited workflow automation, AI agents, and business process automation, delivered as an affordable monthly subscription.",
    features: ["Unlimited workflows", "AI agents", "Dedicated success manager", "Quarterly strategy"],
    benefits: ["Up to 24% lower operating cost", "Replaces a full in-house team"],
    pricing: 4500,
    currency: "USD",
    discount_percent: 10,
    cta_label: "See what we automate",
    cta_url: "https://pagalava.com",
    display_order: 0,
    is_featured: true,
    is_active: true,
  },
  {
    id: "aaaaaaaa-0000-4000-8000-000000000003",
    company_id: COMPANY_ID,
    name: "Legacy Pilot Package",
    slug: "legacy-pilot",
    sku: "PAG-PILOT",
    category: "Pilot",
    short_description: "Retired — kept for reference.",
    description: "Original pilot engagement, no longer sold. Retained to show an inactive product.",
    features: [],
    benefits: [],
    pricing: 900,
    currency: "USD",
    discount_percent: 0,
    display_order: 9,
    is_featured: false,
    is_active: false,
  },
];

const { error } = await db.from("products").upsert(products, { onConflict: "id" });
if (error) {
  console.error("seed failed:", error.message);
  process.exit(1);
}

const { count: total } = await db
  .from("products")
  .select("id", { count: "exact", head: true })
  .eq("company_id", COMPANY_ID)
  .is("deleted_at", null);
const { count: active } = await db
  .from("products")
  .select("id", { count: "exact", head: true })
  .eq("company_id", COMPANY_ID)
  .eq("is_active", true)
  .is("deleted_at", null);

console.log(`seeded 3 products — ${total} total, ${active} active for Pagalava`);
