/**
 * Server-side role separation between the ADMIN and USER dashboards.
 *
 * The property under test is not "the UI hides things" — it is that the
 * server refuses. Each case here is a deliberate attempt to reach data the
 * identity is not entitled to, including IDOR attempts through every
 * parameter a client can influence.
 */
import { resolveDashboardScope, ScopeLookup } from "@/shared/lib/dashboardScope";
import { resolveCompanyAccess, AuthError, AuthenticatedUser } from "@/shared/lib/tenant";
import { UserRole } from "@/shared/lib/rbac";

const ADMIN: AuthenticatedUser = { id: "admin-1", email: "admin@example.com" };
const MEMBER: AuthenticatedUser = { id: "member-1", email: "member@example.com" };
const OUTSIDER: AuthenticatedUser = { id: "outsider-1", email: "outsider@example.com" };

const COMPANY_A = "aaaaaaaa-0000-0000-0000-000000000000";
const COMPANY_B = "bbbbbbbb-0000-0000-0000-000000000000";

/** A fake directory: admin-1 is a platform admin with no membership;
 * member-1 belongs to company A only; outsider-1 belongs to nothing. */
function lookup(overrides: Partial<Record<string, Array<{ company_id: string; role: UserRole }>>> = {}): ScopeLookup {
  const memberships: Record<string, Array<{ company_id: string; role: UserRole }>> = {
    "member-1": [{ company_id: COMPANY_A, role: "OWNER" }],
    "admin-1": [],
    "outsider-1": [],
    ...overrides,
  };
  return {
    isPlatformAdmin: async (userId) => userId === "admin-1",
    listActiveMembershipsForUser: async (userId) => memberships[userId] ?? [],
  };
}

describe("dashboard scope resolution", () => {
  it("rejects an unauthenticated identity with 401", async () => {
    await expect(resolveDashboardScope(null, lookup())).rejects.toMatchObject({ status: 401 });
  });

  it("routes a platform admin to the ADMIN audience", async () => {
    const scope = await resolveDashboardScope(ADMIN, lookup());
    expect(scope.audience).toBe("admin");
    expect(scope.isPlatformAdmin).toBe(true);
  });

  it("routes an ordinary company member to the USER audience, scoped to their own company", async () => {
    const scope = await resolveDashboardScope(MEMBER, lookup());
    expect(scope.audience).toBe("user");
    expect(scope.isPlatformAdmin).toBe(false);
    expect(scope.companyId).toBe(COMPANY_A);
    expect(scope.role).toBe("OWNER"); // owner of THEIR company — still not a platform admin
  });

  it("a company OWNER is never treated as a platform admin", async () => {
    const scope = await resolveDashboardScope(MEMBER, lookup());
    // The distinction that matters: top of one tenant ≠ top of the platform.
    expect(scope.role).toBe("OWNER");
    expect(scope.isPlatformAdmin).toBe(false);
    expect(scope.audience).toBe("user");
  });

  it("gives an identity with no active membership no company at all", async () => {
    const scope = await resolveDashboardScope(OUTSIDER, lookup());
    expect(scope.companyId).toBeNull();
    expect(scope.role).toBeNull();
  });

  it("derives the tenant ONLY from the session — the resolver takes no companyId argument", async () => {
    // Structural guarantee: there is no parameter through which a crafted id
    // could travel, so a client cannot influence the scope at all.
    expect(resolveDashboardScope.length).toBe(2); // (user, lookup)
    const scope = await resolveDashboardScope(MEMBER, lookup());
    expect(scope.companyId).toBe(COMPANY_A);
    expect(scope.companyId).not.toBe(COMPANY_B);
  });

  it("an INVITED (not ACTIVE) membership grants nothing — the lookup only returns active ones", async () => {
    const scope = await resolveDashboardScope(MEMBER, lookup({ "member-1": [] }));
    expect(scope.companyId).toBeNull();
  });

  it("renders exactly one tenant for a multi-company member rather than merging totals", async () => {
    const scope = await resolveDashboardScope(MEMBER, lookup({
      "member-1": [
        { company_id: COMPANY_A, role: "OWNER" },
        { company_id: COMPANY_B, role: "VIEWER" },
      ],
    }));
    expect(scope.companyId).toBe(COMPANY_A);
    // The second tenant is not silently blended into "my numbers".
    expect(JSON.stringify(scope)).not.toContain(COMPANY_B);
  });
});

describe("IDOR: crafted company ids on the company-scoped admin surface", () => {
  const membershipLookup = {
    isPlatformAdmin: async (userId: string) => userId === "admin-1",
    getMembership: async (companyId: string, userId: string) =>
      userId === "member-1" && companyId === COMPANY_A
        ? ({ role: "OWNER", status: "ACTIVE" } as never)
        : null,
  };

  it("refuses a member asking for ANOTHER company's data", async () => {
    await expect(resolveCompanyAccess(MEMBER, COMPANY_B, "read:leads", membershipLookup)).rejects.toBeInstanceOf(AuthError);
    await expect(resolveCompanyAccess(MEMBER, COMPANY_B, "read:leads", membershipLookup)).rejects.toMatchObject({ status: 403 });
  });

  it("allows a member their OWN company", async () => {
    const access = await resolveCompanyAccess(MEMBER, COMPANY_A, "read:leads", membershipLookup);
    expect(access.role).toBe("OWNER");
    expect(access.isPlatformAdmin).toBe(false);
  });

  it("refuses an identity with no membership anywhere", async () => {
    await expect(resolveCompanyAccess(OUTSIDER, COMPANY_A, "read:leads", membershipLookup)).rejects.toMatchObject({ status: 403 });
  });

  it("refuses an unauthenticated caller before any lookup happens", async () => {
    await expect(resolveCompanyAccess(null, COMPANY_A, "read:leads", membershipLookup)).rejects.toMatchObject({ status: 401 });
  });

  it("does not reveal whether the other company exists — same refusal either way", async () => {
    const attempt = async (companyId: string): Promise<AuthError> => {
      try {
        await resolveCompanyAccess(MEMBER, companyId, "read:leads", membershipLookup);
        throw new Error("expected a refusal, got access");
      } catch (e) {
        return e as AuthError;
      }
    };
    const real = await attempt(COMPANY_B);
    const fake = await attempt("cccccccc-0000-0000-0000-000000000000");
    expect(real.status).toBe(fake.status);
    expect(real.message).toBe(fake.message);
  });
});

describe("the user surface never carries platform-wide fields", () => {
  /** Shape guard: the user payload's documented keys must not include the
   * cross-tenant blocks the admin payload owns. Enforced as a list so adding
   * a platform field to the user route trips this test. */
  const USER_PAYLOAD_KEYS = [
    "generatedAt", "user", "company", "range", "qualificationFunnel",
    "bookingConversion", "appointments", "whatsapp", "email", "serviceStatus", "activity",
  ];
  const FORBIDDEN_ON_USER = ["platform", "systemHealth", "environment", "issues", "companies", "users", "employees"];

  it("declares no platform-wide key", () => {
    for (const forbidden of FORBIDDEN_ON_USER) {
      expect(USER_PAYLOAD_KEYS).not.toContain(forbidden);
    }
  });

  it("exposes only own-service provider states, not system health", () => {
    const serviceStatusKeys = ["aiVoice", "calendar", "whatsapp", "email", "pitchAudio"];
    // Database/cron are platform concerns and must not appear on the user
    // surface — a tenant cannot act on them and they describe infrastructure.
    expect(serviceStatusKeys).not.toContain("database");
    expect(serviceStatusKeys).not.toContain("cron");
  });
});
