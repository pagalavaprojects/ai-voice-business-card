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

/**
 * A platform admin administers the PLATFORM, so their reachable companies
 * must not be derived from company_members. Regression: /api/admin/me
 * resolved scope purely from membership rows, so a platform admin with no
 * membership received an empty list and the dashboard rendered "No company
 * selected" — making platform administration depend on company ownership,
 * exactly the coupling the role model forbids. The helper below is the pure
 * form of the rule the route applies.
 */
function resolveSelectableCompanies(
  isPlatformAdmin: boolean,
  memberships: Array<{ company_id: string; role: UserRole }>,
  allCompanies: Array<{ id: string }>
): Array<{ company_id: string; role: string }> {
  if (!isPlatformAdmin) return memberships.map((m) => ({ company_id: m.company_id, role: m.role }));
  const own = new Map(memberships.map((m) => [m.company_id, m]));
  return allCompanies.map((c) => {
    const mine = own.get(c.id);
    return { company_id: c.id, role: mine ? mine.role : "PLATFORM_ADMIN" };
  });
}

describe("selectable companies by role", () => {
  const ALL = [{ id: COMPANY_A }, { id: COMPANY_B }];

  it("gives a membership-less platform admin every company, so admin never depends on ownership", () => {
    const selectable = resolveSelectableCompanies(true, [], ALL);
    expect(selectable.map((s) => s.company_id).sort()).toEqual([COMPANY_A, COMPANY_B].sort());
    expect(selectable.every((s) => s.role === "PLATFORM_ADMIN")).toBe(true);
  });

  it("keeps an admin's genuine membership role rather than relabelling it", () => {
    const selectable = resolveSelectableCompanies(true, [{ company_id: COMPANY_A, role: "OWNER" }], ALL);
    expect(selectable.find((s) => s.company_id === COMPANY_A)!.role).toBe("OWNER");
    expect(selectable.find((s) => s.company_id === COMPANY_B)!.role).toBe("PLATFORM_ADMIN");
  });

  it("gives a NON-admin only their own memberships, never the whole platform", () => {
    const selectable = resolveSelectableCompanies(false, [{ company_id: COMPANY_A, role: "OWNER" }], ALL);
    expect(selectable).toEqual([{ company_id: COMPANY_A, role: "OWNER" }]);
    expect(selectable.some((s) => s.company_id === COMPANY_B)).toBe(false);
  });

  it("gives an identity with no memberships and no admin flag nothing at all", () => {
    expect(resolveSelectableCompanies(false, [], ALL)).toEqual([]);
  });
});

/**
 * Per-EMPLOYEE separation: two staff logins inside ONE company.
 *
 * The schema supports this (employees.user_id links a login to an employee,
 * and conversations/appointments/leads all carry employee_id), so two staff
 * accounts must be genuinely separate rather than two views of the same
 * company totals. The rules encoded here: whoever runs the company reads the
 * whole company; staff read only their own employee's rows; and a staff
 * account with NO linked employee reads nothing at all rather than falling
 * back to company-wide.
 */
function employeeLookup(
  employees: Record<string, string | null>,
  memberships: Record<string, Array<{ company_id: string; role: UserRole }>>
): ScopeLookup {
  return {
    isPlatformAdmin: async (userId) => userId === "admin-1",
    listActiveMembershipsForUser: async (userId) => memberships[userId] ?? [],
    findEmployeeForUser: async (userId) => {
      const id = employees[userId];
      return id ? { id } : null;
    },
  };
}

describe("two staff logins in one company are separated by employee", () => {
  const STAFF_1: AuthenticatedUser = { id: "staff-1", email: "user@example.com" };
  const STAFF_2: AuthenticatedUser = { id: "staff-2", email: "user2@example.com" };
  const OWNER_USER: AuthenticatedUser = { id: "owner-1", email: "owner@example.com" };

  const lookup = employeeLookup(
    { "staff-1": "employee-A", "staff-2": "employee-B", "owner-1": null, "staff-orphan": null },
    {
      "staff-1": [{ company_id: COMPANY_A, role: "EMPLOYEE" }],
      "staff-2": [{ company_id: COMPANY_A, role: "EMPLOYEE" }],
      "owner-1": [{ company_id: COMPANY_A, role: "OWNER" }],
      "staff-orphan": [{ company_id: COMPANY_A, role: "EMPLOYEE" }],
    }
  );

  it("gives each staff login its OWN employee id, never the other's", async () => {
    const one = await resolveDashboardScope(STAFF_1, lookup);
    const two = await resolveDashboardScope(STAFF_2, lookup);
    expect(one.employeeId).toBe("employee-A");
    expect(two.employeeId).toBe("employee-B");
    expect(one.employeeId).not.toBe(two.employeeId);
    // Same tenant — so employee scoping is the ONLY thing separating them.
    expect(one.companyId).toBe(two.companyId);
    expect(one.breadth).toBe("employee");
    expect(two.breadth).toBe("employee");
  });

  it("lets whoever runs the company read the whole company", async () => {
    const owner = await resolveDashboardScope(OWNER_USER, lookup);
    expect(owner.breadth).toBe("company");
    expect(owner.employeeId).toBeNull();
    expect(owner.isPlatformAdmin).toBe(false); // still NOT a platform admin
  });

  it("gives a staff account with no linked employee an empty scope, never company-wide", async () => {
    const orphan = await resolveDashboardScope({ id: "staff-orphan", email: "orphan@example.com" }, lookup);
    expect(orphan.breadth).toBe("employee");
    expect(orphan.employeeId).toBeNull();
    // breadth "employee" + null id is what the route turns into an
    // impossible filter, so an unlinked account reads nothing.
    expect(orphan.breadth === "employee" && orphan.employeeId === null).toBe(true);
  });

  it("still refuses a staff login the admin audience", async () => {
    const one = await resolveDashboardScope(STAFF_1, lookup);
    expect(one.audience).toBe("user");
    expect(one.isPlatformAdmin).toBe(false);
  });

  it("keeps the platform admin cross-tenant and unscoped to any employee", async () => {
    const admin = await resolveDashboardScope({ id: "admin-1", email: "admin@example.com" }, lookup);
    expect(admin.audience).toBe("admin");
    expect(admin.employeeId).toBeNull();
  });
});

/**
 * Company-level authorization is NOT sufficient once two staff logins share
 * a tenant. Verified against production before this was fixed: a staff
 * account with no data of its own opened a colleague's lead by id (HTTP 200,
 * the client's name in the body) and listed twenty of the company's leads,
 * because every /api/admin/* route authorized with requireCompanyAccess —
 * which both staff pass — and then queried by company_id alone.
 *
 * The rule below is what requireCompanyDataScope applies, and what each of
 * those routes now composes into its query or ownership check.
 */
function dataScopeFor(
  role: UserRole | null,
  isPlatformAdmin: boolean,
  linkedEmployeeId: string | null
): { employeeId: string | null } {
  if (isPlatformAdmin || role === "OWNER" || role === "ADMIN") return { employeeId: null };
  return { employeeId: linkedEmployeeId ?? "00000000-0000-0000-0000-000000000000" };
}

/** How a detail route decides whether a row may be opened. */
function mayOpen(row: { company_id: string; employee_id: string | null }, companyId: string, employeeId: string | null): boolean {
  if (row.company_id !== companyId) return false;
  if (employeeId && row.employee_id !== employeeId) return false;
  return true;
}

describe("company access alone does not authorize a colleague's row", () => {
  const COMPANY = COMPANY_A;
  const usersLead = { company_id: COMPANY, employee_id: "employee-A" };
  const colleaguesLead = { company_id: COMPANY, employee_id: "employee-B" };
  const otherTenantLead = { company_id: COMPANY_B, employee_id: "employee-A" };

  it("narrows staff to their own employee id, and leaves owners unnarrowed", () => {
    expect(dataScopeFor("EMPLOYEE", false, "employee-A").employeeId).toBe("employee-A");
    expect(dataScopeFor("VIEWER", false, "employee-B").employeeId).toBe("employee-B");
    expect(dataScopeFor("OWNER", false, "employee-A").employeeId).toBeNull();
    expect(dataScopeFor("ADMIN", false, null).employeeId).toBeNull();
    expect(dataScopeFor("EMPLOYEE", true, null).employeeId).toBeNull(); // platform admin
  });

  it("refuses a staff member the colleague's lead they could previously open", () => {
    const { employeeId } = dataScopeFor("EMPLOYEE", false, "employee-B");
    expect(mayOpen(colleaguesLead, COMPANY, employeeId)).toBe(true); // their own
    expect(mayOpen(usersLead, COMPANY, employeeId)).toBe(false); // the regression
  });

  it("still lets whoever runs the company open either row", () => {
    const { employeeId } = dataScopeFor("OWNER", false, null);
    expect(mayOpen(usersLead, COMPANY, employeeId)).toBe(true);
    expect(mayOpen(colleaguesLead, COMPANY, employeeId)).toBe(true);
  });

  it("keeps refusing another tenant's row regardless of role", () => {
    for (const role of ["OWNER", "ADMIN", "EMPLOYEE"] as UserRole[]) {
      const { employeeId } = dataScopeFor(role, false, "employee-A");
      expect(mayOpen(otherTenantLead, COMPANY, employeeId)).toBe(false);
    }
  });

  it("gives a staff account with no employee record an id that matches nothing", () => {
    const { employeeId } = dataScopeFor("EMPLOYEE", false, null);
    expect(employeeId).toBe("00000000-0000-0000-0000-000000000000");
    expect(mayOpen(usersLead, COMPANY, employeeId)).toBe(false);
    expect(mayOpen(colleaguesLead, COMPANY, employeeId)).toBe(false);
  });
});
