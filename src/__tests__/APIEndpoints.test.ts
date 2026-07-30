import { GET as healthHandler } from "@/app/api/health/route";
import { GET as leadsHandler } from "@/app/api/admin/leads/route";
import { NextRequest } from "next/server";

describe("Next.js API Route Endpoints Integration", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      NEXT_PUBLIC_SUPABASE_URL: "https://demo.supabase.co",
      VAPI_API_KEY: "vapi-demo-key",
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("GET /api/health reports degraded (not a fabricated healthy) when Supabase is a placeholder/demo URL", async () => {
    // This is the real fix for the original audit's finding that health
    // previously reported "healthy" purely from Boolean(env var present),
    // even for a fake URL. Confirming a real "healthy" requires an
    // actually-reachable Supabase project — Requires Live Infrastructure.
    const response = await healthHandler();
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.status).toBe("degraded");
    expect(json.version).toBe("1.0.0");
    expect(json.services.database.status).toBe("unconfigured");
  });

  it("GET /api/health reports unhealthy (503) when Supabase looks real but is actually unreachable", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://nonexistent-project-xyz123.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "not-a-placeholder-but-fake-key";

    const response = await healthHandler();
    const json = await response.json();

    expect(response.status).toBe(503);
    expect(json.status).toBe("unhealthy");
    expect(json.services.database.status).toBe("error");
  }, 15000);

  it("GET /api/admin/leads without companyId should return 400 Bad Request", async () => {
    const req = new NextRequest("http://localhost:3000/api/admin/leads");
    const response = await leadsHandler(req);
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.success).toBe(false);
    expect(json.message).toContain("companyId query parameter is required");
  });
});
