import { resolveCompanyAccess, AuthError, MembershipLookup } from "@/shared/lib/tenant";
import { CompanyMember } from "@/core/domain/models/types";

const COMPANY_A = "11111111-1111-1111-1111-111111111111";
const COMPANY_B = "22222222-2222-2222-2222-222222222222";
const USER = { id: "user-1", email: "user@acme.test" };

function membershipFixture(overrides: Partial<CompanyMember> = {}): CompanyMember {
  return {
    id: "member-1",
    company_id: COMPANY_A,
    user_id: USER.id,
    role: "VIEWER",
    status: "ACTIVE",
    invited_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

function lookup(overrides: Partial<MembershipLookup> = {}): MembershipLookup {
  return {
    isPlatformAdmin: jest.fn().mockResolvedValue(false),
    getMembership: jest.fn().mockResolvedValue(null),
    ...overrides,
  };
}

describe("resolveCompanyAccess — the tenant-isolation gate the prior audit found missing", () => {
  it("rejects unauthenticated requests with 401", async () => {
    await expect(resolveCompanyAccess(null, COMPANY_A, "read:leads", lookup())).rejects.toMatchObject(
      new AuthError(401, "Authentication required")
    );
  });

  it("rejects a user with no membership row for the requested company (the original IDOR) with 403", async () => {
    await expect(
      resolveCompanyAccess(USER, COMPANY_A, "read:leads", lookup({ getMembership: jest.fn().mockResolvedValue(null) }))
    ).rejects.toThrow(AuthError);
  });

  it("rejects a real member of a DIFFERENT company trying to read this company's data", async () => {
    const l = lookup({
      // user is a member of COMPANY_A only
      getMembership: jest.fn(async (companyId: string) => (companyId === COMPANY_A ? membershipFixture() : null)),
    });
    await expect(resolveCompanyAccess(USER, COMPANY_B, "read:leads", l)).rejects.toThrow(AuthError);
  });

  it("rejects an INVITED (not yet ACTIVE) member", async () => {
    const l = lookup({ getMembership: jest.fn().mockResolvedValue(membershipFixture({ status: "INVITED" })) });
    await expect(resolveCompanyAccess(USER, COMPANY_A, "read:leads", l)).rejects.toThrow(AuthError);
  });

  it("rejects a VIEWER attempting a write", async () => {
    const l = lookup({ getMembership: jest.fn().mockResolvedValue(membershipFixture({ role: "VIEWER" })) });
    await expect(resolveCompanyAccess(USER, COMPANY_A, "write:leads", l)).rejects.toThrow(AuthError);
  });

  it("allows a MANAGER to write leads but not manage settings", async () => {
    const l = lookup({ getMembership: jest.fn().mockResolvedValue(membershipFixture({ role: "MANAGER" })) });
    await expect(resolveCompanyAccess(USER, COMPANY_A, "write:leads", l)).resolves.toMatchObject({ role: "MANAGER" });
    await expect(resolveCompanyAccess(USER, COMPANY_A, "manage:settings", l)).rejects.toThrow(AuthError);
  });

  it("allows an OWNER full access to their own company", async () => {
    const l = lookup({ getMembership: jest.fn().mockResolvedValue(membershipFixture({ role: "OWNER" })) });
    await expect(resolveCompanyAccess(USER, COMPANY_A, "manage:api_keys", l)).resolves.toMatchObject({
      role: "OWNER",
      isPlatformAdmin: false,
    });
  });

  it("grants a platform admin access to any company regardless of membership", async () => {
    const l = lookup({ isPlatformAdmin: jest.fn().mockResolvedValue(true), getMembership: jest.fn().mockResolvedValue(null) });
    await expect(resolveCompanyAccess(USER, COMPANY_B, "manage:api_keys", l)).resolves.toMatchObject({
      isPlatformAdmin: true,
    });
  });
});
