import { NextRequest } from "next/server";
import { __resetInMemoryRateLimit } from "@/shared/lib/rateLimitMemory";
import { GET, POST } from "@/app/api/public/[companyId]/[employeeId]/appointments/route";

/**
 * Regression tests for the public "Book an Appointment" modal's backing
 * route. The modal it serves used to be a pure UI mockup: hardcoded time
 * slots, a setTimeout(...) that always reported "Appointment confirmed!",
 * and no call to any real API — nobody was ever booked and no email was
 * ever sent. These tests pin that this route (a) never claims a
 * confirmation the underlying tools didn't actually report, and (b)
 * delegates to the exact same save_lead/book_appointment tools the live
 * voice call uses, rather than a second, parallel booking implementation.
 */

const resolveCompanyDefaults = jest.fn();
const getTool = jest.fn();

jest.mock("@/core/infrastructure/bootstrap/assistantRuntime", () => ({
  toolRegistry: {
    resolveCompanyDefaults: (...args: unknown[]) => resolveCompanyDefaults(...args),
    getTool: (...args: unknown[]) => getTool(...args),
  },
}));

const getAvailableSlots = jest.fn();
const isConfigured = jest.fn();

jest.mock("@/core/infrastructure/booking/calcom/CalcomAdapter", () => ({
  CalcomAdapter: jest.fn().mockImplementation(() => ({
    getAvailableSlots: (...args: unknown[]) => getAvailableSlots(...args),
    isConfigured: () => isConfigured(),
  })),
}));

const getCompanyById = jest.fn();
const getEmployeeById = jest.fn();

jest.mock("@/core/infrastructure/database/supabase/SupabaseKnowledgeRepository", () => ({
  SupabaseKnowledgeRepository: jest.fn().mockImplementation(() => ({
    getCompanyById: (...args: unknown[]) => getCompanyById(...args),
    getEmployeeById: (...args: unknown[]) => getEmployeeById(...args),
  })),
}));

// getLeadByEmail defaults to null (no existing lead) so the standard flow
// still goes through save_lead; a test overrides it to prove lead reuse.
const getLeadByEmail = jest.fn(async (..._args: unknown[]) => null as unknown);
jest.mock("@/core/infrastructure/database/supabase/SupabaseCRMRepository", () => ({
  SupabaseCRMRepository: jest.fn().mockImplementation(() => ({
    getLeadByEmail: (...args: unknown[]) => getLeadByEmail(...args),
  })),
}));

const PARAMS = { params: { companyId: "company-1", employeeId: "employee-1" } };

function postRequest(body: unknown, ip = "10.0.0.1") {
  return new NextRequest("http://localhost:3000/api/public/company-1/employee-1/appointments", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify(body),
  });
}

describe("GET /api/public/[companyId]/[employeeId]/appointments", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    __resetInMemoryRateLimit();
    getCompanyById.mockResolvedValue({ id: "company-1", name: "Test Co" });
    getEmployeeById.mockResolvedValue({ id: "employee-1", company_id: "company-1", name: "Test Employee" });
  });

  it("returns no slots (not a crash) when no Cal.com event type is configured anywhere", async () => {
    resolveCompanyDefaults.mockResolvedValue({ eventTypeId: undefined });

    const req = new NextRequest("http://localhost:3000/api/public/company-1/employee-1/appointments");
    const res = await GET(req, PARAMS);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({ configured: false, slots: [], reason: "unconfigured" });
    expect(getAvailableSlots).not.toHaveBeenCalled();
  });

  it("returns the real slots CalcomAdapter reports, and passes through its configured state honestly", async () => {
    resolveCompanyDefaults.mockResolvedValue({ eventTypeId: 555 });
    isConfigured.mockReturnValue(true);
    getAvailableSlots.mockResolvedValue([{ time: "2026-09-01T10:00:00.000Z" }, { time: "2026-09-01T11:00:00.000Z" }]);

    const req = new NextRequest("http://localhost:3000/api/public/company-1/employee-1/appointments?timeZone=UTC");
    const res = await GET(req, PARAMS);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.configured).toBe(true);
    expect(json.slots).toHaveLength(2);
    expect(getAvailableSlots).toHaveBeenCalledWith(555, expect.any(String), expect.any(String), "UTC");
  });

  it("degrades to an empty slot list instead of a 500 when the slots lookup throws — and reports it as an outage, not 'unconfigured'", async () => {
    resolveCompanyDefaults.mockResolvedValue({ eventTypeId: 555 });
    getAvailableSlots.mockRejectedValue(new Error("Cal.com is down"));

    const req = new NextRequest("http://localhost:3000/api/public/company-1/employee-1/appointments");
    const res = await GET(req, PARAMS);
    const json = await res.json();

    expect(res.status).toBe(200);
    // The distinction matters: "unconfigured" tells a visitor this company
    // doesn't do online booking (true, when eventTypeId is genuinely
    // absent); a real Cal.com outage is a different, temporary situation
    // and must not collapse into that same message.
    expect(json).toEqual({ configured: false, slots: [], reason: "error" });
  });

  it("returns 404, not 200 unconfigured, for a company that doesn't exist", async () => {
    getCompanyById.mockResolvedValue(null);
    resolveCompanyDefaults.mockResolvedValue({ eventTypeId: undefined });

    const req = new NextRequest("http://localhost:3000/api/public/company-1/employee-1/appointments");
    const res = await GET(req, PARAMS);

    expect(res.status).toBe(404);
    // 2026-08-19 waterfall fix: the settings read now rides the SAME batch
    // as the identity check (both key only off URL params), shaving a
    // serial DB round trip off every legitimate modal open. The 404 must
    // still WIN — the concurrent read's result is simply discarded, and no
    // Cal.com call is ever made for an unknown card.
    expect(getAvailableSlots).not.toHaveBeenCalled();
  });

  it("returns 404 for an employee that doesn't belong to the given company", async () => {
    getEmployeeById.mockResolvedValue({ id: "employee-1", company_id: "some-other-company" });

    const req = new NextRequest("http://localhost:3000/api/public/company-1/employee-1/appointments");
    const res = await GET(req, PARAMS);

    expect(res.status).toBe(404);
  });

  it("rate-limits repeated slot lookups from the same visitor, independently of the booking-submission limit", async () => {
    resolveCompanyDefaults.mockResolvedValue({ eventTypeId: 555 });
    isConfigured.mockReturnValue(true);
    getAvailableSlots.mockResolvedValue([{ time: "2026-09-01T10:00:00.000Z" }]);

    const ip = "198.51.100.7";
    const makeReq = () => new NextRequest("http://localhost:3000/api/public/company-1/employee-1/appointments", { headers: { "x-forwarded-for": ip } });

    for (let i = 0; i < 30; i++) {
      const res = await GET(makeReq(), PARAMS);
      expect(res.status).toBe(200);
    }
    const blocked = await GET(makeReq(), PARAMS);
    expect(blocked.status).toBe(429);
    const json = await blocked.json();
    expect(json.reason).toBe("rate_limited");
  });
});

describe("POST /api/public/[companyId]/[employeeId]/appointments", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    __resetInMemoryRateLimit();
    getCompanyById.mockResolvedValue({ id: "company-1", name: "Test Co" });
    getEmployeeById.mockResolvedValue({ id: "employee-1", company_id: "company-1", name: "Test Employee" });
  });

  const VALID_BODY = {
    name: "Test Visitor",
    email: "visitor@example.com",
    phone: "+1 555 000 0000",
    startTime: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    timeZone: "UTC",
  };

  it("returns 404 for a booking attempt against a company/employee that doesn't exist, before touching any tool", async () => {
    getCompanyById.mockResolvedValue(null);

    const res = await POST(postRequest(VALID_BODY), PARAMS);

    expect(res.status).toBe(404);
    expect(getTool).not.toHaveBeenCalled();
  });

  it("rejects an invalid body with 400 before touching any tool", async () => {
    const res = await POST(postRequest({ name: "" }), PARAMS);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(getTool).not.toHaveBeenCalled();
  });

  it("rejects a start time in the past with 400", async () => {
    const res = await POST(postRequest({ ...VALID_BODY, startTime: "2020-01-01T00:00:00.000Z" }), PARAMS);
    expect(res.status).toBe(400);
  });

  it("calls save_lead then book_appointment (the same tools the voice call uses), and reports a real CONFIRMED result", async () => {
    const saveLead = jest.fn().mockResolvedValue({ success: true, lead_id: "lead-42" });
    const bookAppointment = jest.fn().mockResolvedValue({ success: true, confirmed: true, status: "BOOKED", message: "Appointment confirmed and a calendar invitation has been sent." });
    getTool.mockImplementation((name: string) => (name === "save_lead" ? { execute: saveLead } : name === "book_appointment" ? { execute: bookAppointment } : undefined));

    const res = await POST(postRequest(VALID_BODY), PARAMS);
    const json = await res.json();

    expect(saveLead).toHaveBeenCalledWith(
      expect.objectContaining({ name: VALID_BODY.name, email: VALID_BODY.email, phone: VALID_BODY.phone }),
      { companyId: "company-1", employeeId: "employee-1" }
    );
    // Exact args, not just objectContaining(lead_id) — book_appointment
    // (ToolRegistry.ts) reads the timezone via the lowercase `args.timezone`
    // key specifically. A mock loose enough to accept any shape here would
    // keep passing even if this route's key name silently drifted from
    // what the tool actually reads, which would book every visitor's
    // meeting in UTC regardless of their real timezone.
    const expectedEndTime = new Date(new Date(VALID_BODY.startTime).getTime() + 30 * 60_000).toISOString();
    expect(bookAppointment).toHaveBeenCalledWith(
      { lead_id: "lead-42", start_time: VALID_BODY.startTime, end_time: expectedEndTime, timezone: "UTC" },
      { companyId: "company-1", employeeId: "employee-1" }
    );
    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.confirmed).toBe(true);
    expect(json.message).toMatch(/confirmed/i);
  });

  it("reuses an existing lead for the same email instead of minting a new one (dedupe so a resubmit can't slip past booking idempotency)", async () => {
    // A resubmit (network retry / slow-response retry) must NOT create a
    // second lead — a fresh lead_id would bypass book_appointment's
    // lead-keyed idempotency and double-book. When a lead already exists for
    // this email+company, reuse it and skip save_lead entirely.
    getLeadByEmail.mockResolvedValueOnce({ id: "lead-existing", company_id: "company-1", email: VALID_BODY.email });
    const saveLead = jest.fn().mockResolvedValue({ success: true, lead_id: "lead-new" });
    const bookAppointment = jest.fn().mockResolvedValue({ success: true, confirmed: true, status: "BOOKED", message: "Appointment confirmed." });
    getTool.mockImplementation((name: string) => (name === "save_lead" ? { execute: saveLead } : name === "book_appointment" ? { execute: bookAppointment } : undefined));

    const res = await POST(postRequest(VALID_BODY), PARAMS);

    // No new lead created; the booking runs against the EXISTING lead, so its
    // own same-slot idempotency governs whether a duplicate is created.
    expect(saveLead).not.toHaveBeenCalled();
    expect(bookAppointment).toHaveBeenCalledWith(
      expect.objectContaining({ lead_id: "lead-existing" }),
      { companyId: "company-1", employeeId: "employee-1" }
    );
    expect(res.status).toBe(200);
  });

  it("still creates a lead via save_lead for a genuinely new visitor (no existing lead)", async () => {
    // getLeadByEmail default is null — the normal first-time path.
    const saveLead = jest.fn().mockResolvedValue({ success: true, lead_id: "lead-fresh" });
    const bookAppointment = jest.fn().mockResolvedValue({ success: true, confirmed: true, status: "BOOKED", message: "Appointment confirmed." });
    getTool.mockImplementation((name: string) => (name === "save_lead" ? { execute: saveLead } : name === "book_appointment" ? { execute: bookAppointment } : undefined));

    const res = await POST(postRequest(VALID_BODY), PARAMS);

    expect(saveLead).toHaveBeenCalledTimes(1);
    expect(bookAppointment).toHaveBeenCalledWith(expect.objectContaining({ lead_id: "lead-fresh" }), expect.anything());
    expect(res.status).toBe(200);
  });

  it("reports REQUESTED honestly — never rewrites it into a false 'confirmed' — when book_appointment could not reach Cal.com", async () => {
    const saveLead = jest.fn().mockResolvedValue({ success: true, lead_id: "lead-42" });
    const bookAppointment = jest.fn().mockResolvedValue({ success: true, confirmed: false, status: "REQUESTED", message: "Preferred time noted. A confirmation will follow shortly by email." });
    getTool.mockImplementation((name: string) => (name === "save_lead" ? { execute: saveLead } : name === "book_appointment" ? { execute: bookAppointment } : undefined));

    const res = await POST(postRequest(VALID_BODY), PARAMS);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.confirmed).toBe(false);
    expect(json.message).not.toMatch(/confirmed/i);
    expect(json.status).toBe("REQUESTED");
  });

  it("returns 500 with an honest failure message — not a fabricated success — when the tools throw", async () => {
    const saveLead = jest.fn().mockRejectedValue(new Error("database unreachable"));
    getTool.mockImplementation((name: string) => (name === "save_lead" ? { execute: saveLead } : { execute: jest.fn() }));

    const res = await POST(postRequest(VALID_BODY), PARAMS);
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.success).toBe(false);
  });

  it("rate-limits repeated attempts from the same visitor instead of allowing unbounded booking spam", async () => {
    const saveLead = jest.fn().mockResolvedValue({ success: true, lead_id: "lead-42" });
    const bookAppointment = jest.fn().mockResolvedValue({ success: true, confirmed: true, status: "BOOKED", message: "Confirmed." });
    getTool.mockImplementation((name: string) => (name === "save_lead" ? { execute: saveLead } : name === "book_appointment" ? { execute: bookAppointment } : undefined));

    const ip = "203.0.113.9";
    for (let i = 0; i < 8; i++) {
      const res = await POST(postRequest(VALID_BODY, ip), PARAMS);
      expect(res.status).toBe(200);
    }
    const blocked = await POST(postRequest(VALID_BODY, ip), PARAMS);
    expect(blocked.status).toBe(429);
  });
});
