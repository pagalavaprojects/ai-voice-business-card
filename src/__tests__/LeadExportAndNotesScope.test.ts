import { NextRequest } from "next/server";

/**
 * Two cross-user leaks in the lead surface, found by attacking production.
 *
 * Both are the same mistake in different clothes: the route authorised the
 * TENANT and then trusted that, while two staff logins legitimately share a
 * tenant. Phase 37 closed this on the lead list, detail and appointment
 * routes; these two were missed.
 *
 *  - GET /api/admin/leads/export queried by company_id alone, so a staff
 *    account with no leads of its own exported all 27 of a colleague's and
 *    got a signed CSV URL for them (HTTP 200, "Exported 27 leads").
 *  - POST /api/admin/leads/[leadId]/notes resolved the caller's employee id
 *    and then never consulted it, so the same account wrote a note onto a
 *    colleague's lead (HTTP 201, row stored).
 *
 * The narrowing is null for platform admins and OWNER/ADMIN, and the
 * caller's own employee id for staff — so these tests pin the staff case
 * (must be narrowed) and the owner case (must not be).
 */

const listLeads = jest.fn();
const getLeadById = jest.fn();
const addActivity = jest.fn();
const requireCompanyDataScope = jest.fn();

jest.mock("@/shared/lib/tenant", () => ({
  requireCompanyDataScope: (...args: unknown[]) => requireCompanyDataScope(...args),
  AuthError: class AuthError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  },
}));

jest.mock("@/core/infrastructure/database/supabase/SupabaseCRMRepository", () => ({
  SupabaseCRMRepository: jest.fn().mockImplementation(() => ({
    listLeads: (...args: unknown[]) => listLeads(...args),
    getLeadById: (...args: unknown[]) => getLeadById(...args),
    addActivity: (...args: unknown[]) => addActivity(...args),
  })),
}));

jest.mock("@/core/infrastructure/storage/SupabaseStorageAdapter", () => ({
  SupabaseStorageAdapter: jest.fn().mockImplementation(() => ({
    ensureBucket: jest.fn().mockResolvedValue(undefined),
    upload: jest.fn().mockResolvedValue(undefined),
    getSignedUrl: jest.fn().mockResolvedValue("https://example.invalid/signed.csv"),
  })),
}));

import { GET as exportLeads } from "@/app/api/admin/leads/export/route";
import { POST as addNote } from "@/app/api/admin/leads/[leadId]/notes/route";

const COMPANY = "33333333-3333-3333-3333-333333333333";
const STAFF_EMPLOYEE = "de0dd80d-0000-0000-0000-000000000000";
const COLLEAGUE_EMPLOYEE = "44444444-4444-4444-4444-444444444444";

beforeEach(() => {
  jest.clearAllMocks();
  listLeads.mockResolvedValue({ leads: [], total: 0 });
  addActivity.mockResolvedValue({ id: "note-1" });
});

describe("GET /api/admin/leads/export", () => {
  function exportRequest() {
    return new NextRequest(`https://maylaanai.com/api/admin/leads/export?companyId=${COMPANY}`);
  }

  it("exports only the staff member's own leads", async () => {
    requireCompanyDataScope.mockResolvedValue({ access: { userId: "u2" }, employeeId: STAFF_EMPLOYEE });

    await exportLeads(exportRequest());

    expect(listLeads).toHaveBeenCalledWith(expect.objectContaining({ company_id: COMPANY, employee_id: STAFF_EMPLOYEE }));
  });

  it("still exports the whole company for whoever runs it", async () => {
    // OWNER/ADMIN and platform admins resolve to a null narrowing.
    requireCompanyDataScope.mockResolvedValue({ access: { userId: "owner" }, employeeId: null });

    await exportLeads(exportRequest());

    const filter = listLeads.mock.calls[0][0];
    expect(filter.company_id).toBe(COMPANY);
    expect(filter).not.toHaveProperty("employee_id");
  });
});

describe("POST /api/admin/leads/[leadId]/notes", () => {
  function noteRequest(body: Record<string, unknown>) {
    const req = new NextRequest("https://maylaanai.com/api/admin/leads/lead-1/notes", { method: "POST" });
    req.json = async () => body;
    return req;
  }

  it("refuses to write a note onto a colleague's lead", async () => {
    requireCompanyDataScope.mockResolvedValue({ access: { userId: "u2" }, employeeId: STAFF_EMPLOYEE });
    getLeadById.mockResolvedValue({ id: "lead-1", company_id: COMPANY, employee_id: COLLEAGUE_EMPLOYEE });

    const res = await addNote(noteRequest({ company_id: COMPANY, content: "probe" }), { params: { leadId: "lead-1" } });

    expect(res.status).toBe(404);
    expect(addActivity).not.toHaveBeenCalled();
  });

  it("gives the same 404 as a lead that does not exist, so refusal confirms nothing", async () => {
    requireCompanyDataScope.mockResolvedValue({ access: { userId: "u2" }, employeeId: STAFF_EMPLOYEE });
    getLeadById.mockResolvedValue(null);

    const missing = await addNote(noteRequest({ company_id: COMPANY, content: "probe" }), { params: { leadId: "nope" } });
    expect(missing.status).toBe(404);
  });

  it("allows a note on the staff member's own lead", async () => {
    requireCompanyDataScope.mockResolvedValue({ access: { userId: "u2" }, employeeId: STAFF_EMPLOYEE });
    getLeadById.mockResolvedValue({ id: "lead-1", company_id: COMPANY, employee_id: STAFF_EMPLOYEE });

    const res = await addNote(noteRequest({ company_id: COMPANY, content: "my own note" }), { params: { leadId: "lead-1" } });

    expect(res.status).toBe(201);
    expect(addActivity).toHaveBeenCalled();
  });

  it("lets whoever runs the company annotate any of its leads", async () => {
    requireCompanyDataScope.mockResolvedValue({ access: { userId: "owner" }, employeeId: null });
    getLeadById.mockResolvedValue({ id: "lead-1", company_id: COMPANY, employee_id: COLLEAGUE_EMPLOYEE });

    const res = await addNote(noteRequest({ company_id: COMPANY, content: "owner note" }), { params: { leadId: "lead-1" } });

    expect(res.status).toBe(201);
  });

  it("refuses a lead belonging to another company outright", async () => {
    requireCompanyDataScope.mockResolvedValue({ access: { userId: "owner" }, employeeId: null });
    getLeadById.mockResolvedValue({ id: "lead-1", company_id: "99999999-9999-9999-9999-999999999999", employee_id: null });

    const res = await addNote(noteRequest({ company_id: COMPANY, content: "cross tenant" }), { params: { leadId: "lead-1" } });

    expect(res.status).toBe(404);
    expect(addActivity).not.toHaveBeenCalled();
  });
});
