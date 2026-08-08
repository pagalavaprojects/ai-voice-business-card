/**
 * Regression test for the confirmed tenant-isolation gap: all 5 CMS admin
 * routes (profile, home, services, solutions, seo) previously had no auth
 * call at all and a hardcoded demo-company-UUID fallback — any caller could
 * read or write ANY company's CMS content by supplying its companyId, and a
 * request with no companyId silently fell back to writing the demo
 * company's data. Each route now requires read:cms/write:cms via
 * requireCompanyAccess, requires an explicit company id, and routes errors
 * through handleApiError instead of leaking raw error internals.
 *
 * One shared table drives all 5 routes through the same 6 cases rather than
 * duplicating near-identical test bodies per route.
 */
import { NextRequest } from "next/server";
import { AuthError } from "@/shared/lib/tenant";

const requireCompanyAccess = jest.fn();
jest.mock("@/shared/lib/tenant", () => {
  const actual = jest.requireActual("@/shared/lib/tenant");
  return { ...actual, requireCompanyAccess: (...args: unknown[]) => requireCompanyAccess(...args) };
});

const repo = {
  getCompanyProfile: jest.fn(),
  upsertCompanyProfile: jest.fn(),
  getHomePageContent: jest.fn(),
  upsertHomePageContent: jest.fn(),
  getServices: jest.fn(),
  upsertService: jest.fn(),
  getAISolutions: jest.fn(),
  upsertAISolution: jest.fn(),
  getSEOSettings: jest.fn(),
  upsertSEOSettings: jest.fn(),
};
jest.mock("@/core/infrastructure/database/supabase/SupabaseCMSRepository", () => ({ cmsRepository: repo }));

const COMPANY_A = "11111111-1111-1111-1111-111111111111";

function getRequest(companyId?: string): NextRequest {
  const url = companyId
    ? `http://localhost/api/admin/cms/profile?companyId=${companyId}`
    : "http://localhost/api/admin/cms/profile";
  return new NextRequest(url, { method: "GET" });
}

function postRequest(body: unknown, malformedJson = false): NextRequest {
  const req = new NextRequest("http://localhost/api/admin/cms/profile", { method: "POST" });
  req.json = malformedJson ? async () => { throw new SyntaxError("Unexpected token in JSON"); } : async () => body;
  return req;
}

interface RouteCase {
  name: string;
  routePath: string;
  readMethod: keyof typeof repo;
  writeMethod: keyof typeof repo;
  fixture: Record<string, unknown>;
}

const routes: RouteCase[] = [
  { name: "profile", routePath: "@/app/api/admin/cms/profile/route", readMethod: "getCompanyProfile", writeMethod: "upsertCompanyProfile", fixture: { tagline: "AI voice cards" } },
  { name: "home", routePath: "@/app/api/admin/cms/home/route", readMethod: "getHomePageContent", writeMethod: "upsertHomePageContent", fixture: { hero_title: "Welcome" } },
  { name: "services", routePath: "@/app/api/admin/cms/services/route", readMethod: "getServices", writeMethod: "upsertService", fixture: { name: "Voice AI" } },
  { name: "solutions", routePath: "@/app/api/admin/cms/solutions/route", readMethod: "getAISolutions", writeMethod: "upsertAISolution", fixture: { name: "Lead Qualification" } },
  { name: "seo", routePath: "@/app/api/admin/cms/seo/route", readMethod: "getSEOSettings", writeMethod: "upsertSEOSettings", fixture: { meta_title: "Pagalava" } },
];

describe.each(routes)("CMS route: $name", ({ routePath, readMethod, writeMethod, fixture }) => {
  // Each route module is loaded fresh per describe block via isolateModules-
  // style dynamic require, since the route path differs per case.
  const { GET, POST } = require(routePath);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("1. authorized read succeeds and returns the repository's data", async () => {
    requireCompanyAccess.mockResolvedValue({ userId: "user-1", role: "OWNER", isPlatformAdmin: false });
    (repo[readMethod] as jest.Mock).mockResolvedValue(fixture);

    const res = await GET(getRequest(COMPANY_A));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data).toEqual(fixture);
    expect(requireCompanyAccess).toHaveBeenCalledWith(expect.anything(), COMPANY_A, "read:cms");
  });

  it("2. authorized write succeeds and persists company_id from the request, not a fallback", async () => {
    requireCompanyAccess.mockResolvedValue({ userId: "user-1", role: "OWNER", isPlatformAdmin: false });
    (repo[writeMethod] as jest.Mock).mockResolvedValue({ ...fixture, company_id: COMPANY_A });

    const res = await POST(postRequest({ ...fixture, company_id: COMPANY_A }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(requireCompanyAccess).toHaveBeenCalledWith(expect.anything(), COMPANY_A, "write:cms");
    expect(repo[writeMethod]).toHaveBeenCalledWith(expect.objectContaining({ company_id: COMPANY_A }));
  });

  it("3. unauthorized company read is rejected (403), never reaches the repository", async () => {
    requireCompanyAccess.mockRejectedValue(new AuthError(403, "Forbidden: insufficient permissions"));

    const res = await GET(getRequest(COMPANY_A));
    const json = await res.json();

    expect(res.status).toBe(403);
    expect(json.success).toBe(false);
    expect(repo[readMethod]).not.toHaveBeenCalled();
  });

  it("4. unauthorized company write is rejected (403), never reaches the repository", async () => {
    requireCompanyAccess.mockRejectedValue(new AuthError(403, "Forbidden: insufficient permissions"));

    const res = await POST(postRequest({ ...fixture, company_id: COMPANY_A }));
    const json = await res.json();

    expect(res.status).toBe(403);
    expect(json.success).toBe(false);
    expect(repo[writeMethod]).not.toHaveBeenCalled();
  });

  it("5. missing company id is rejected with 400 on both GET and POST, before any auth/repo call — no silent demo-company fallback", async () => {
    const getRes = await GET(getRequest(undefined));
    expect(getRes.status).toBe(400);
    expect(requireCompanyAccess).not.toHaveBeenCalled();
    expect(repo[readMethod]).not.toHaveBeenCalled();

    const postRes = await POST(postRequest({ ...fixture }));
    expect(postRes.status).toBe(400);
    expect(requireCompanyAccess).not.toHaveBeenCalled();
    expect(repo[writeMethod]).not.toHaveBeenCalled();
  });

  it("6. a malformed request body returns a controlled error, not a raw exception leak", async () => {
    const res = await POST(postRequest(null, true));
    const json = await res.json();

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
    expect(json.success).toBe(false);
    // The response must never echo the raw SyntaxError/stack back to the caller.
    expect(JSON.stringify(json)).not.toMatch(/at Object|node_modules|\.ts:\d+/);
  });
});
