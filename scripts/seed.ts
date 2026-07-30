import { supabaseAdmin } from "../src/shared/lib/supabase";

const DEMO_COMPANY_ID = "11111111-1111-1111-1111-111111111111";
const DEMO_EMPLOYEE_ID = "22222222-2222-2222-2222-222222222222";

async function seedDatabase() {
  console.log("[Seed Script] Populating initial enterprise demo seed data...");

  // 1. Seed Demo Company
  const { error: companyErr } = await supabaseAdmin.from("companies").upsert(
    {
      id: DEMO_COMPANY_ID,
      name: "Acme Autonomous Corp",
      website: "https://acme.ai",
      logo_url: null,
      settings: {},
    },
    { onConflict: "id" }
  );

  if (companyErr && !companyErr.message.includes("placeholder")) {
    console.error("❌ Company seed error:", companyErr.message);
  } else {
    console.log("✅ Seeded Company [Acme Autonomous Corp]");
  }

  // 2. Seed Demo Employee
  const { error: employeeErr } = await supabaseAdmin.from("employees").upsert(
    {
      id: DEMO_EMPLOYEE_ID,
      company_id: DEMO_COMPANY_ID,
      name: "Sarah Connor",
      designation: "VP of AI Solutions",
      phone: "+1 (555) 019-2831",
      email: "sarah@acme.ai",
      office_address: "San Francisco, CA",
      working_hours: "9 AM - 5 PM PST",
      vapi_agent_id: null,
    },
    { onConflict: "id" }
  );

  if (employeeErr && !employeeErr.message.includes("placeholder")) {
    console.error("❌ Employee seed error:", employeeErr.message);
  } else {
    console.log("✅ Seeded Employee [Sarah Connor]");
  }

  // 3. Seed Demo Products
  const { error: productErr } = await supabaseAdmin.from("products").upsert(
    [
      {
        company_id: DEMO_COMPANY_ID,
        name: "Enterprise Voice AI Platform",
        description: "Autonomous digital twin employees for voice conversations and meeting booking.",
        features: ["WebRTC streaming", "Lead qualification", "Cal.com booking"],
        benefits: ["24/7 availability", "Automated lead capture"],
        pricing: 49.0,
        currency: "USD",
        target_audience: "SMB and Enterprise sales teams",
      },
      {
        company_id: DEMO_COMPANY_ID,
        name: "Custom AI Agent Fine-Tuning",
        description: "Custom voice clone model training and company knowledge base embedding.",
        features: ["Voice cloning", "RAG knowledge base", "Prompt customization"],
        benefits: ["Brand-matched voice", "Deep product knowledge"],
        pricing: 299.0,
        currency: "USD",
        target_audience: "Enterprise clients needing custom digital twins",
      },
    ],
    { onConflict: "id", ignoreDuplicates: true }
  );

  if (productErr && !productErr.message.includes("placeholder")) {
    console.error("❌ Products seed error:", productErr.message);
  } else {
    console.log("✅ Seeded 2 Demo Products");
  }

  // 4. Seed Demo FAQs
  const { error: faqErr } = await supabaseAdmin.from("faqs").upsert(
    [
      {
        company_id: DEMO_COMPANY_ID,
        category: "Technology",
        question: "How does the AI voice assistant book meetings?",
        answer:
          "The AI executes the book_appointment function tool during the call, querying Cal.com for real-time calendar availability.",
      },
      {
        company_id: DEMO_COMPANY_ID,
        category: "Security",
        question: "Is visitor data secure and isolated per company?",
        answer:
          "Yes. All lead records are stored in PostgreSQL with company-isolated Row Level Security (RLS) policies enforced at the database level.",
      },
      {
        company_id: DEMO_COMPANY_ID,
        category: "Pricing",
        question: "What is the pricing model?",
        answer:
          "We offer a $49/month SaaS subscription for the base platform plus a one-time $299 custom fine-tuning option.",
      },
    ],
    { onConflict: "id", ignoreDuplicates: true }
  );

  if (faqErr && !faqErr.message.includes("placeholder")) {
    console.error("❌ FAQs seed error:", faqErr.message);
  } else {
    console.log("✅ Seeded 3 Demo FAQs");
  }

  // 5. Seed Prompt Templates
  const { error: promptErr } = await supabaseAdmin.from("prompt_templates").upsert(
    [
      {
        company_id: DEMO_COMPANY_ID,
        module_name: "identity",
        template_content:
          "You are {{employee_name}}, {{employee_designation}} at {{company_name}}. Your personality is professional, warm, and knowledgeable.",
        version: 1,
        is_active: true,
      },
      {
        company_id: DEMO_COMPANY_ID,
        module_name: "sales",
        template_content:
          "Help visitors understand our products and services, qualify leads naturally, and offer to schedule a discovery call when appropriate.",
        version: 1,
        is_active: true,
      },
    ],
    { onConflict: "company_id,module_name" }
  );

  if (promptErr && !promptErr.message.includes("placeholder")) {
    console.error("❌ Prompt templates seed error:", promptErr.message);
  } else {
    console.log("✅ Seeded 2 Prompt Templates");
  }

  console.log("\n[Seed Script] ✅ Database seeding complete!");
  console.log(`Demo Company ID: ${DEMO_COMPANY_ID}`);
  console.log(`Demo Employee ID: ${DEMO_EMPLOYEE_ID}`);
  console.log(
    `Demo Voice Card URL: http://localhost:3000/${DEMO_COMPANY_ID}/${DEMO_EMPLOYEE_ID}`
  );
}

seedDatabase().catch(console.error);
