/**
 * The 24h reminder cron must be: fail-closed without its secret, a pure
 * no-op without WhatsApp credentials (no markers written, no deliveries
 * claimed), idempotent per lead via the timeline marker, and must skip
 * leads with no phone rather than guessing one.
 */
import { NextRequest } from "next/server";

const send = jest.fn();
const isConfigured = jest.fn();
jest.mock("@/core/infrastructure/notifications/WhatsAppNotifier", () => ({
  getWhatsAppNotifier: () => ({ isConfigured, send }),
}));

const getLeadById = jest.fn();
const getActivityTimeline = jest.fn();
const addActivity = jest.fn();
jest.mock("@/core/infrastructure/database/supabase/SupabaseCRMRepository", () => ({
  SupabaseCRMRepository: jest.fn().mockImplementation(() => ({ getLeadById, getActivityTimeline, addActivity })),
}));

const getEmployeeById = jest.fn();
jest.mock("@/core/infrastructure/database/supabase/SupabaseKnowledgeRepository", () => ({
  SupabaseKnowledgeRepository: jest.fn().mockImplementation(() => ({ getEmployeeById })),
}));

// Datasets served per query. appointmentRows = the 24-48h appointment sweep
// (query uses .gte); leadRows = the unused-lead sweep (from "leads");
// leadApptRows = the "does this lead have an appointment" lookup (from
// "appointments" WITHOUT .gte).
const appointmentRows: Array<Record<string, unknown>> = [];
const leadRows: Array<Record<string, unknown>> = [];
const leadApptRows: Array<Record<string, unknown>> = [];
jest.mock("@/shared/lib/supabase", () => ({
  supabaseAdmin: {
    from: (table: string) => {
      const state = { gte: false };
      const b: Record<string, unknown> = {};
      for (const m of ["select", "eq", "lte", "order", "limit"]) b[m] = () => b;
      b.gte = () => {
        state.gte = true;
        return b;
      };
      b.in = () => b;
      // Thenable: resolves to the dataset for this query shape.
      (b as { then: (r: (v: unknown) => void) => void }).then = (resolve) => {
        const data = table === "leads" ? leadRows : state.gte ? appointmentRows : leadApptRows;
        resolve({ data, error: null });
      };
      return b;
    },
  },
}));

// Atomic in-memory claim store (JS single-thread => acquire is atomic).
const reminderClaims = new Set<string>();
const acquireClaim = jest.fn(async (key: string) => {
  if (reminderClaims.has(key)) return false;
  reminderClaims.add(key);
  return true;
});
const releaseClaim = jest.fn(async (key: string) => {
  reminderClaims.delete(key);
});
jest.mock("@/core/infrastructure/concurrency/ProcessingLock", () => ({
  acquireClaim: (key: string) => acquireClaim(key),
  releaseClaim: (key: string) => releaseClaim(key),
}));

import { GET } from "@/app/api/cron/reminders/route";

const APPT = {
  id: "appt-1",
  company_id: "c1",
  employee_id: "e1",
  lead_id: "l1",
  start_time: "2026-08-09T10:00:00Z",
  status: "BOOKED",
  created_at: "2026-08-07T10:00:00Z",
};

function request(auth?: string): NextRequest {
  return new NextRequest("http://localhost/api/cron/reminders", {
    headers: auth ? { authorization: auth } : {},
  });
}

describe("reminder cron", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    appointmentRows.length = 0;
    leadRows.length = 0;
    leadApptRows.length = 0;
    reminderClaims.clear();
    process.env.CRON_SECRET = "test-secret";
    isConfigured.mockReturnValue(true);
    send.mockResolvedValue({ sent: true });
    getLeadById.mockResolvedValue({ id: "l1", name: "Asha", phone: "+91 94431 25639" });
    getEmployeeById.mockResolvedValue({ id: "e1", name: "Srinivasan", phone: "+91 90000 00000" });
    getActivityTimeline.mockResolvedValue([]);
    addActivity.mockResolvedValue({});
  });

  it("fails closed: 503 without CRON_SECRET configured, 401 with a wrong bearer", async () => {
    delete process.env.CRON_SECRET;
    expect((await GET(request("Bearer anything"))).status).toBe(503);

    process.env.CRON_SECRET = "test-secret";
    expect((await GET(request("Bearer wrong"))).status).toBe(401);
    expect((await GET(request())).status).toBe(401);
  });

  it("is a pure no-op without WhatsApp credentials — nothing sent, no markers written", async () => {
    isConfigured.mockReturnValue(false);
    appointmentRows.push(APPT);

    const res = await GET(request("Bearer test-secret"));
    const json = await res.json();

    expect(json).toEqual({ processed: 0, skipped: "whatsapp_unconfigured" });
    expect(send).not.toHaveBeenCalled();
    expect(addActivity).not.toHaveBeenCalled();
  });

  it("sends client + owner reminders and writes the idempotency marker", async () => {
    appointmentRows.push(APPT);

    const json = await (await GET(request("Bearer test-secret"))).json();

    expect(json.sent).toBe(1);
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[0][0]).toBe("+91 94431 25639");
    expect(send.mock.calls[1][0]).toBe("+91 90000 00000");
    expect(addActivity).toHaveBeenCalledWith("l1", "c1", "NOTE", "whatsapp_reminder_24h", undefined, expect.objectContaining({ appointment_id: "appt-1" }));
  });

  it("never reminds the same lead twice — the timeline marker short-circuits", async () => {
    appointmentRows.push(APPT);
    getActivityTimeline.mockResolvedValue([{ content: "whatsapp_reminder_24h" }]);

    const json = await (await GET(request("Bearer test-secret"))).json();

    expect(json.alreadyReminded).toBe(1);
    expect(send).not.toHaveBeenCalled();
  });

  it("skips leads without a phone number instead of guessing", async () => {
    appointmentRows.push(APPT);
    getLeadById.mockResolvedValue({ id: "l1", name: "Asha", phone: null });

    const json = await (await GET(request("Bearer test-secret"))).json();

    expect(json.skippedNoPhone).toBe(1);
    expect(send).not.toHaveBeenCalled();
    expect(addActivity).not.toHaveBeenCalled();
  });

  it("leaves a failed send unmarked so the next daily run retries it", async () => {
    appointmentRows.push(APPT);
    send.mockResolvedValue({ sent: false, reason: "http_500" });

    const json = await (await GET(request("Bearer test-secret"))).json();

    expect(json.sent).toBe(0);
    expect(addActivity).not.toHaveBeenCalled();
  });

  it.each([2, 5])("with %i concurrent cron workers, the client reminder is sent exactly ONCE", async (N) => {
    // Two overlapping cron deliveries would both pass the marker check; the
    // atomic claim must let only one actually send.
    appointmentRows.push({ ...APPT });
    const results = await Promise.all(Array.from({ length: N }, () => GET(request("Bearer test-secret"))));

    const clientSends = send.mock.calls.filter((c) => c[0] === "+91 94431 25639");
    expect(clientSends).toHaveLength(1);
    for (const r of results) expect(r.status).toBe(200);
  });

  it("releases the claim on a failed send so a later run retries (mark-on-success / retry-on-failure preserved)", async () => {
    appointmentRows.push({ ...APPT });
    // First run: the client send fails -> claim must be released, no marker.
    send.mockResolvedValueOnce({ sent: false, reason: "http_500" });
    await GET(request("Bearer test-secret"));
    expect(releaseClaim).toHaveBeenCalledWith("reminder:appt-1");
    expect(addActivity).not.toHaveBeenCalled();

    // Second run: the claim is free again, the send now succeeds and is marked.
    send.mockResolvedValue({ sent: true });
    await GET(request("Bearer test-secret"));
    const clientSends = send.mock.calls.filter((c) => c[0] === "+91 94431 25639");
    expect(clientSends).toHaveLength(2); // attempted (failed) then retried (sent)
    expect(addActivity).toHaveBeenCalledTimes(1); // marked only on the successful run
  });
});

describe("2-day unused-lead reminder (req 15) — distinct sweep, same engine", () => {
  const LEAD = {
    id: "lead-u1",
    company_id: "c1",
    employee_id: "e1",
    name: "Priya",
    email: "priya@example.com",
    phone: "+91 98888 12345",
    status: "NEW",
    created_at: "2026-09-04T10:00:00Z",
  };

  beforeEach(() => {
    jest.clearAllMocks();
    appointmentRows.length = 0;
    leadRows.length = 0;
    leadApptRows.length = 0;
    reminderClaims.clear();
    process.env.CRON_SECRET = "test-secret";
    isConfigured.mockReturnValue(true);
    send.mockResolvedValue({ sent: true });
    getEmployeeById.mockResolvedValue({ id: "e1", name: "Srinivasan", phone: "+91 90000 00000" });
    getActivityTimeline.mockResolvedValue([]);
    addActivity.mockResolvedValue({});
  });

  it("reminds the OWNER about a NEW lead unused ~2 days (no appointment) and writes the distinct marker", async () => {
    leadRows.push({ ...LEAD });

    const json = await (await GET(request("Bearer test-secret"))).json();

    expect(json.unusedLeads.sent).toBe(1);
    // Sent to the owner's phone (the one who must follow up), not the lead.
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0]).toBe("+91 90000 00000");
    expect(send.mock.calls[0][1]).toContain("Priya");
    expect(addActivity).toHaveBeenCalledWith("lead-u1", "c1", "NOTE", "lead_unused_reminder_2d", undefined, expect.objectContaining({ kind: "unused_lead_2d" }));
  });

  it("does NOT remind a lead that already has an appointment — it isn't unused", async () => {
    leadRows.push({ ...LEAD });
    leadApptRows.push({ lead_id: "lead-u1" });

    const json = await (await GET(request("Bearer test-secret"))).json();

    expect(json.unusedLeads.sent).toBe(0);
    expect(send).not.toHaveBeenCalled();
    expect(addActivity).not.toHaveBeenCalled();
  });

  it("never reminds the same unused lead twice — the distinct marker short-circuits", async () => {
    leadRows.push({ ...LEAD });
    getActivityTimeline.mockResolvedValue([{ content: "lead_unused_reminder_2d" }]);

    const json = await (await GET(request("Bearer test-secret"))).json();

    expect(json.unusedLeads.alreadyReminded).toBe(1);
    expect(send).not.toHaveBeenCalled();
  });

  it("skips when the owner has no phone to send to", async () => {
    leadRows.push({ ...LEAD });
    getEmployeeById.mockResolvedValue({ id: "e1", name: "Srinivasan", phone: null });

    const json = await (await GET(request("Bearer test-secret"))).json();

    expect(json.unusedLeads.skippedNoOwner).toBe(1);
    expect(send).not.toHaveBeenCalled();
    expect(addActivity).not.toHaveBeenCalled();
  });

  it("releases the claim on a failed send and writes no marker (retry-on-failure preserved)", async () => {
    leadRows.push({ ...LEAD });
    send.mockResolvedValue({ sent: false, reason: "http_401" });

    const json = await (await GET(request("Bearer test-secret"))).json();

    expect(json.unusedLeads.sent).toBe(0);
    expect(releaseClaim).toHaveBeenCalledWith("lead-unused-reminder:lead-u1");
    expect(addActivity).not.toHaveBeenCalled();
  });

  it.each([2, 4])("with %i concurrent cron workers, an unused lead is reminded exactly ONCE", async (N) => {
    leadRows.push({ ...LEAD });
    const results = await Promise.all(Array.from({ length: N }, () => GET(request("Bearer test-secret"))));
    const ownerSends = send.mock.calls.filter((c) => c[0] === "+91 90000 00000");
    expect(ownerSends).toHaveLength(1);
    for (const r of results) expect(r.status).toBe(200);
  });

  it("stays a no-op without WhatsApp credentials (delivery externally gated)", async () => {
    isConfigured.mockReturnValue(false);
    leadRows.push({ ...LEAD });

    const json = await (await GET(request("Bearer test-secret"))).json();

    expect(json).toEqual({ processed: 0, skipped: "whatsapp_unconfigured" });
    expect(send).not.toHaveBeenCalled();
  });
});
