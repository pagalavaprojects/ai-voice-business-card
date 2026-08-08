/**
 * Regression test for a confirmed inconsistency between this app's two
 * public card routes: /c/[slug] already called next/navigation's notFound()
 * for an unresolved card, but /[companyId]/[employeeId] did not — it always
 * rendered <PublicBusinessCard>, which shows its own honest "not found" UI
 * client-side, but the page's own HTTP response was still 200 OK even for a
 * companyId/employeeId that doesn't exist. Both routes must now agree.
 */
// This Jest environment's React build doesn't export the server-only
// cache() the page module calls at module scope — outside a real Next.js
// server runtime there's nothing to dedupe across, so an identity shim is
// enough to load the module unchanged.
jest.mock("react", () => ({ ...jest.requireActual("react"), cache: (fn: unknown) => fn }));

const getCompanyById = jest.fn();
const getEmployeeById = jest.fn();
jest.mock("@/core/infrastructure/database/supabase/SupabaseKnowledgeRepository", () => ({
  SupabaseKnowledgeRepository: jest.fn().mockImplementation(() => ({
    getCompanyById: (...args: unknown[]) => getCompanyById(...args),
    getEmployeeById: (...args: unknown[]) => getEmployeeById(...args),
  })),
}));

// Mirrors Next's real behaviour closely enough for this test: notFound()
// throws (a special digest error in real Next.js) rather than returning, so
// any code path that doesn't call it before continuing is caught by
// asserting nothing after it (e.g. rendering PublicBusinessCard) ran.
const notFound = jest.fn(() => {
  throw new Error("NEXT_NOT_FOUND");
});
jest.mock("next/navigation", () => ({ notFound: () => notFound() }));

jest.mock("next/headers", () => ({ headers: () => new Map([["host", "maylaanai.com"]]) }));

jest.mock("@/features/voice/components/PublicBusinessCard", () => ({
  PublicBusinessCard: () => null,
}));

import VoiceBusinessCardPage from "@/app/(public)/[companyId]/[employeeId]/page";

describe("/[companyId]/[employeeId] page — not-found consistency with /c/[slug]", () => {
  beforeEach(() => jest.clearAllMocks());

  it("calls notFound() for a company that doesn't exist, instead of rendering a 200 page", async () => {
    getCompanyById.mockResolvedValue(null);
    getEmployeeById.mockResolvedValue({ id: "emp-1", company_id: "comp-1" });

    await expect(
      VoiceBusinessCardPage({ params: { companyId: "comp-1", employeeId: "emp-1" } })
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFound).toHaveBeenCalled();
  });

  it("calls notFound() when the employee belongs to a different company", async () => {
    getCompanyById.mockResolvedValue({ id: "comp-1", name: "Test Co" });
    getEmployeeById.mockResolvedValue({ id: "emp-1", company_id: "some-other-company" });

    await expect(
      VoiceBusinessCardPage({ params: { companyId: "comp-1", employeeId: "emp-1" } })
    ).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("does not call notFound() for a valid company/employee pair", async () => {
    getCompanyById.mockResolvedValue({ id: "comp-1", name: "Test Co", website: null, logo_url: null });
    getEmployeeById.mockResolvedValue({ id: "emp-1", company_id: "comp-1", name: "Test Employee", designation: "Founder", slug: null });

    const result = await VoiceBusinessCardPage({ params: { companyId: "comp-1", employeeId: "emp-1" } });

    expect(notFound).not.toHaveBeenCalled();
    expect(result).toBeTruthy();
  });
});
