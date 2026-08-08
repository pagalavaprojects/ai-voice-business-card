import { NextRequest } from "next/server";
import { __resetInMemoryRateLimit } from "@/shared/lib/rateLimitMemory";

/**
 * Regression tests for the public business card route: it previously had no
 * rate limiting at any layer (the Edge middleware's matcher only covers
 * /dashboard and /api/admin, never /api/public), unlike every other public
 * endpoint in this app. This is the first request every real page view
 * makes, so the limit here is deliberately generous — it exists to blunt
 * scraping/enumeration of the companyId/employeeId space, not to throttle a
 * normal visitor.
 */

const getCompanyById = jest.fn();
const getEmployeeById = jest.fn();
jest.mock("@/core/infrastructure/database/supabase/SupabaseKnowledgeRepository", () => ({
  SupabaseKnowledgeRepository: jest.fn().mockImplementation(() => ({
    getCompanyById: (...args: unknown[]) => getCompanyById(...args),
    getEmployeeById: (...args: unknown[]) => getEmployeeById(...args),
    getServicesByCompany: jest.fn().mockResolvedValue([]),
    getProductsByCompany: jest.fn().mockResolvedValue([]),
    getFAQsByCompany: jest.fn().mockResolvedValue([]),
  })),
}));

jest.mock("@/core/infrastructure/database/supabase/SupabaseSettingsRepository", () => ({
  SupabaseSettingsRepository: jest.fn().mockImplementation(() => ({
    getSettings: jest.fn().mockResolvedValue(null),
    getBranding: jest.fn().mockResolvedValue(null),
  })),
}));

jest.mock("@/core/infrastructure/storage/SupabaseStorageAdapter", () => ({
  SupabaseStorageAdapter: jest.fn().mockImplementation(() => ({
    getPublicUrl: jest.fn().mockReturnValue("https://cdn.test/avatar.png"),
  })),
}));

jest.mock("@/core/infrastructure/bootstrap/assistantRuntime", () => ({
  promptAssemblyService: { assembleSystemPrompt: jest.fn().mockResolvedValue("You are a helpful voice assistant.") },
  toolRegistry: { getAllToolDefinitions: jest.fn().mockReturnValue([]) },
  agentRepo: { getAgentByEmployee: jest.fn().mockResolvedValue(null) },
}));

import { GET } from "@/app/api/public/[companyId]/[employeeId]/route";

const PARAMS = { params: { companyId: "company-1", employeeId: "employee-1" } };

function makeRequest(ip = "10.0.0.1") {
  return new NextRequest("http://localhost:3000/api/public/company-1/employee-1", {
    headers: { "x-forwarded-for": ip },
  });
}

describe("GET /api/public/[companyId]/[employeeId]", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    __resetInMemoryRateLimit();
    getCompanyById.mockResolvedValue({ id: "company-1", name: "Test Co", website: null, logo_url: null });
    getEmployeeById.mockResolvedValue({
      id: "employee-1",
      company_id: "company-1",
      name: "Test Employee",
      is_active: true,
      slug: null,
      social_links: {},
    });
  });

  it("serves the card on a normal request", async () => {
    const res = await GET(makeRequest(), PARAMS);
    expect(res.status).toBe(200);
  });

  it("404s for a company that does not exist", async () => {
    getCompanyById.mockResolvedValue(null);
    const res = await GET(makeRequest(), PARAMS);
    expect(res.status).toBe(404);
  });

  it("404s for an employee belonging to a different company", async () => {
    getEmployeeById.mockResolvedValue({ id: "employee-1", company_id: "some-other-company", is_active: true });
    const res = await GET(makeRequest(), PARAMS);
    expect(res.status).toBe(404);
  });

  it("rate-limits repeated requests from the same visitor instead of leaving the route unbounded", async () => {
    const ip = "198.51.100.42";
    for (let i = 0; i < 60; i++) {
      const res = await GET(makeRequest(ip), PARAMS);
      expect(res.status).toBe(200);
    }
    const blocked = await GET(makeRequest(ip), PARAMS);
    expect(blocked.status).toBe(429);
  });

  it("tracks rate limits per IP, so one visitor's traffic never blocks another's", async () => {
    for (let i = 0; i < 60; i++) {
      await GET(makeRequest("198.51.100.1"), PARAMS);
    }
    const otherVisitor = await GET(makeRequest("198.51.100.2"), PARAMS);
    expect(otherVisitor.status).toBe(200);
  });
});
