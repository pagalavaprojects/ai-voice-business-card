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

  it("GET /api/health should return health status and service statuses", async () => {
    const response = await healthHandler();
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.status).toBe("healthy");
    expect(json.version).toBe("1.0.0");
    expect(json.services.database).toBe("connected");
  });

  it("GET /api/admin/leads without companyId should return 400 Bad Request", async () => {
    const req = new NextRequest("http://localhost:3000/api/admin/leads");
    const response = await leadsHandler(req);
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.success).toBe(false);
    expect(json.message).toContain("companyId query parameter is required");
  });
});
