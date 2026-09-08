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

// Email path (unused-lead reminder). Configured only when RESEND_API_KEY looks
// real — each test sets or deletes it explicitly.
const sendEmail = jest.fn();
jest.mock("@/core/infrastructure/email/ResendEmailAdapter", () => ({
  ResendEmailAdapter: jest.fn().mockImplementation(() => ({ sendEmail })),
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
// Batched lookups of the unused-contact sweep (one query per table, never
// one per lead): timeline activities and owner employees.
const activityRows: Array<Record<string, unknown>> = [];
const employeeRows: Array<Record<string, unknown>> = [];
/** Every from(table) call, so tests can prove the sweep issues ONE query per
 * table regardless of the number of candidates. */
const tableCalls: string[] = [];
jest.mock("@/shared/lib/supabase", () => ({
  supabaseAdmin: {
    from: (table: string) => {
      tableCalls.push(table);
      const state = { gte: false };
      const b: Record<string, unknown> = {};
      for (const m of ["select", "eq", "lte", "order", "limit", "is"]) b[m] = () => b;
      b.gte = () => {
        state.gte = true;
        return b;
      };
      b.in = () => b;
      // Thenable: resolves to the dataset for this query shape.
      (b as { then: (r: (v: unknown) => void) => void }).then = (resolve) => {
        const data =
          table === "leads" ? leadRows : table === "lead_activities" ? activityRows : table === "employees" ? employeeRows : state.gte ? appointmentRows : leadApptRows;
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
    delete process.env.RESEND_API_KEY;
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

    expect(json).toEqual({ processed: 0, skipped: "notifications_unconfigured" });
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

describe("2-day unused-contact reminder (Item 15) — distinct sweep, same engine", () => {
  const H = 3600_000;
  const LEAD = {
    id: "lead-u1",
    company_id: "c1",
    employee_id: "e1",
    name: "Priya",
    email: "priya@example.com",
    phone: "+91 98888 12345",
    status: "NEW",
    created_at: new Date(Date.now() - 60 * H).toISOString(),
    deleted_at: null,
  };
  const OWNER = { id: "e1", company_id: "c1", name: "Srinivasan", phone: "+91 90000 00000", email: null, deleted_at: null };
  const run = () => GET(request("Bearer test-secret")).then((r) => r.json());
  const marker = (content: string) => ({ lead_id: "lead-u1", type: "NOTE", content });

  beforeEach(() => {
    jest.clearAllMocks();
    appointmentRows.length = 0;
    leadRows.length = 0;
    leadApptRows.length = 0;
    activityRows.length = 0;
    employeeRows.length = 0;
    tableCalls.length = 0;
    reminderClaims.clear();
    process.env.CRON_SECRET = "test-secret";
    delete process.env.RESEND_API_KEY;
    isConfigured.mockReturnValue(true);
    send.mockResolvedValue({ sent: true });
    addActivity.mockResolvedValue({});
    sendEmail.mockResolvedValue({ id: "em_1", success: true });
    employeeRows.push({ ...OWNER });
  });

  describe("eligibility through the real entry point", () => {
    it("nudges the LEAD and prompts the OWNER (WhatsApp) for a NEW lead unused ~2.5 days, writing the marker once with channel results", async () => {
      leadRows.push({ ...LEAD });
      const json = await run();
      expect(json.unusedLeads).toMatchObject({ processed: 1, eligible: 1, sent: 1, failed: 0 });
      expect(send).toHaveBeenCalledTimes(2);
      const to = send.mock.calls.map((c) => c[0]);
      expect(to).toContain("+91 98888 12345");
      expect(to).toContain("+91 90000 00000");
      expect(send.mock.calls.find((c) => c[0] === "+91 90000 00000")![1]).toContain("Priya");
      expect(send.mock.calls.find((c) => c[0] === "+91 98888 12345")![1]).toContain("Srinivasan");
      expect(sendEmail).not.toHaveBeenCalled();
      expect(addActivity).toHaveBeenCalledTimes(1);
      expect(addActivity).toHaveBeenCalledWith(
        "lead-u1",
        "c1",
        "NOTE",
        "lead_unused_reminder_2d",
        undefined,
        expect.objectContaining({ kind: "unused_lead_2d", attempt: 1, channels: { leadWhatsapp: "sent", ownerWhatsapp: "sent", leadEmail: "skipped", ownerEmail: "skipped" } })
      );
    });

    it("is not eligible before 48h even if the query returned the row (the selector is authoritative)", async () => {
      leadRows.push({ ...LEAD, created_at: new Date(Date.now() - 47 * H).toISOString() });
      const json = await run();
      expect(json.unusedLeads).toMatchObject({ processed: 1, eligible: 0, sent: 0, excluded: { too_recent: 1 } });
      expect(send).not.toHaveBeenCalled();
      expect(acquireClaim).not.toHaveBeenCalled();
    });

    it("excludes a deleted lead, a lead with an appointment, and a lead whose contact was used (CALL)", async () => {
      leadRows.push({ ...LEAD, id: "lead-del", deleted_at: new Date().toISOString() });
      leadRows.push({ ...LEAD, id: "lead-appt", email: "a@example.com", phone: "+91 90000 11111" });
      leadRows.push({ ...LEAD, id: "lead-used", email: "u@example.com", phone: "+91 90000 22222" });
      leadApptRows.push({ lead_id: "lead-appt" });
      activityRows.push({ lead_id: "lead-used", type: "CALL", content: "Called the lead back" });
      const json = await run();
      expect(json.unusedLeads).toMatchObject({ processed: 3, eligible: 0, sent: 0, skippedUsed: 2, excluded: { deleted: 1, has_appointment: 1, used: 1 } });
      expect(send).not.toHaveBeenCalled();
      expect(addActivity).not.toHaveBeenCalled();
    });

    it("never reminds the same lead twice — the success marker short-circuits before any claim", async () => {
      leadRows.push({ ...LEAD });
      activityRows.push(marker("lead_unused_reminder_2d"));
      const json = await run();
      expect(json.unusedLeads).toMatchObject({ alreadyReminded: 1, sent: 0 });
      expect(send).not.toHaveBeenCalled();
      expect(acquireClaim).not.toHaveBeenCalled();
    });

    it("reminds a person captured twice through the newest record only", async () => {
      leadRows.push({ ...LEAD, id: "lead-new", created_at: new Date(Date.now() - 55 * H).toISOString() });
      leadRows.push({ ...LEAD, id: "lead-old", created_at: new Date(Date.now() - 100 * H).toISOString() });
      const json = await run();
      expect(json.unusedLeads).toMatchObject({ processed: 2, eligible: 1, sent: 1, excluded: { duplicate_contact: 1 } });
      expect(addActivity).toHaveBeenCalledWith("lead-new", "c1", "NOTE", "lead_unused_reminder_2d", undefined, expect.anything());
    });

    it("issues ONE query per table for any number of candidates (no N+1)", async () => {
      for (let i = 0; i < 12; i++) leadRows.push({ ...LEAD, id: `lead-${i}`, email: `p${i}@example.com`, phone: `+91 90000 000${String(i).padStart(2, "0")}` });
      await run();
      expect(tableCalls.filter((t) => t === "leads")).toHaveLength(1);
      expect(tableCalls.filter((t) => t === "lead_activities")).toHaveLength(1);
      expect(tableCalls.filter((t) => t === "employees")).toHaveLength(1);
      // appointments: the 24h sweep's own query + ONE lookup for the sweep
      expect(tableCalls.filter((t) => t === "appointments")).toHaveLength(2);
      expect(getEmployeeById).not.toHaveBeenCalled();
      expect(getActivityTimeline).not.toHaveBeenCalled();
    });
  });

  describe("channels", () => {
    it("still nudges the lead when the owner has no phone — channels are independent", async () => {
      employeeRows.length = 0;
      employeeRows.push({ ...OWNER, phone: null });
      leadRows.push({ ...LEAD });
      const json = await run();
      expect(json.unusedLeads.sent).toBe(1);
      expect(send).toHaveBeenCalledTimes(1);
      expect(send.mock.calls[0][0]).toBe("+91 98888 12345");
    });

    it("skips (no claim, no marker) when there is no reachable channel for the lead or the owner", async () => {
      employeeRows.length = 0;
      employeeRows.push({ ...OWNER, phone: null, email: null });
      leadRows.push({ ...LEAD, phone: null, email: null });
      const json = await run();
      expect(json.unusedLeads.skippedNoChannel).toBe(1);
      expect(send).not.toHaveBeenCalled();
      expect(acquireClaim).not.toHaveBeenCalled();
      expect(addActivity).not.toHaveBeenCalled();
    });

    it("email path: with Resend configured and WhatsApp unconfigured, lead + owner are emailed (idempotency-keyed), nothing is WhatsApp'd", async () => {
      isConfigured.mockReturnValue(false);
      process.env.RESEND_API_KEY = "re_Live0123456789abcdef";
      employeeRows.length = 0;
      employeeRows.push({ ...OWNER, email: "srini@example.com" });
      leadRows.push({ ...LEAD });
      const json = await run();
      expect(json.skipped).toBe("whatsapp_unconfigured"); // the appointment sweep needs WhatsApp
      expect(json.unusedLeads.sent).toBe(1);
      expect(send).not.toHaveBeenCalled();
      expect(sendEmail).toHaveBeenCalledTimes(2);
      const emails = sendEmail.mock.calls.map((c) => c[0] as { to: string; html: string; idempotencyKey?: string });
      expect(emails.map((e) => e.to).sort()).toEqual(["priya@example.com", "srini@example.com"]);
      for (const e of emails) expect(e.idempotencyKey).toMatch(/^lead-unused-2d:lead-u1:(lead|owner)$/);
      expect(emails.find((e) => e.to === "priya@example.com")!.html).toContain("Srinivasan");
      expect(addActivity).toHaveBeenCalledWith(
        "lead-u1",
        "c1",
        "NOTE",
        "lead_unused_reminder_2d",
        undefined,
        expect.objectContaining({ channels: { leadEmail: "sent", ownerEmail: "sent", leadWhatsapp: "skipped", ownerWhatsapp: "skipped" } })
      );
    });

    it("both channels configured: all four sends happen and the marker records each", async () => {
      process.env.RESEND_API_KEY = "re_Live0123456789abcdef";
      employeeRows.length = 0;
      employeeRows.push({ ...OWNER, email: "srini@example.com" });
      leadRows.push({ ...LEAD });
      const json = await run();
      expect(json.unusedLeads.sent).toBe(1);
      expect(send).toHaveBeenCalledTimes(2);
      expect(sendEmail).toHaveBeenCalledTimes(2);
      expect(addActivity).toHaveBeenCalledWith(
        "lead-u1",
        "c1",
        "NOTE",
        "lead_unused_reminder_2d",
        undefined,
        expect.objectContaining({ channels: { leadWhatsapp: "sent", leadEmail: "sent", ownerWhatsapp: "sent", ownerEmail: "sent" } })
      );
    });

    it.each([
      ["email provider throws (5xx)", () => sendEmail.mockRejectedValue(new Error("ResendEmailAdapter failed: 500 boom"))],
      ["email provider times out", () => sendEmail.mockRejectedValue(Object.assign(new Error("aborted"), { name: "AbortError" }))],
      ["email provider returns a malformed response", () => sendEmail.mockResolvedValue(undefined)],
      ["email provider reports success:false", () => sendEmail.mockResolvedValue({ id: "", success: false })],
    ])("a failing email channel (%s) is isolated: WhatsApp still delivers and the marker records the failure", async (_label, arrange) => {
      process.env.RESEND_API_KEY = "re_Live0123456789abcdef";
      arrange();
      leadRows.push({ ...LEAD });
      const json = await run();
      expect(json.unusedLeads.sent).toBe(1);
      expect(send).toHaveBeenCalledTimes(2);
      expect(addActivity).toHaveBeenCalledWith(
        "lead-u1",
        "c1",
        "NOTE",
        "lead_unused_reminder_2d",
        undefined,
        expect.objectContaining({ channels: expect.objectContaining({ leadEmail: "failed", leadWhatsapp: "sent", ownerWhatsapp: "sent" }) })
      );
    });

    it.each([
      ["http_401 (non-retryable auth)", { sent: false, reason: "http_401" }],
      ["http_500 (retryable)", { sent: false, reason: "http_500" }],
      ["timeout", { sent: false, reason: "timeout" }],
      ["network_error", { sent: false, reason: "network_error" }],
      ["malformed result", {}],
    ])("a failing WhatsApp channel (%s) with Resend configured: the emails still deliver and the marker records the failure", async (_label, result) => {
      process.env.RESEND_API_KEY = "re_Live0123456789abcdef";
      send.mockResolvedValue(result);
      employeeRows.length = 0;
      employeeRows.push({ ...OWNER, email: "srini@example.com" });
      leadRows.push({ ...LEAD });
      const json = await run();
      expect(json.unusedLeads.sent).toBe(1);
      expect(sendEmail).toHaveBeenCalledTimes(2);
      expect(addActivity).toHaveBeenCalledWith(
        "lead-u1",
        "c1",
        "NOTE",
        "lead_unused_reminder_2d",
        undefined,
        expect.objectContaining({ channels: { leadWhatsapp: "failed", ownerWhatsapp: "failed", leadEmail: "sent", ownerEmail: "sent" } })
      );
    });
  });

  describe("failure, retry and recovery", () => {
    it("when every channel fails: writes an observable FAILED marker (attempt 1), releases the claim, counts the failure, no success marker", async () => {
      send.mockResolvedValue({ sent: false, reason: "http_401" });
      leadRows.push({ ...LEAD });
      const json = await run();
      expect(json.unusedLeads).toMatchObject({ sent: 0, failed: 1 });
      expect(releaseClaim).toHaveBeenCalledWith("lead-unused-reminder:lead-u1");
      expect(addActivity).toHaveBeenCalledTimes(1);
      expect(addActivity).toHaveBeenCalledWith(
        "lead-u1",
        "c1",
        "NOTE",
        "lead_unused_reminder_2d_failed",
        undefined,
        expect.objectContaining({ kind: "unused_lead_2d", attempt: 1, maxAttempts: 3, channels: expect.objectContaining({ leadWhatsapp: "failed", ownerWhatsapp: "failed" }) })
      );
    });

    it("retries on the next run after a failure and marks success as attempt 2", async () => {
      send.mockResolvedValueOnce({ sent: false, reason: "http_500" }).mockResolvedValueOnce({ sent: false, reason: "http_500" });
      leadRows.push({ ...LEAD });
      await run(); // both sends fail -> failed marker, claim released
      activityRows.push(marker("lead_unused_reminder_2d_failed"));
      send.mockResolvedValue({ sent: true });
      const json = await run();
      expect(json.unusedLeads.sent).toBe(1);
      expect(addActivity).toHaveBeenLastCalledWith("lead-u1", "c1", "NOTE", "lead_unused_reminder_2d", undefined, expect.objectContaining({ attempt: 2 }));
      expect(reminderClaims.has("lead-unused-reminder:lead-u1")).toBe(true); // the claim persists on success
    });

    it("stops after the maximum number of failed attempts (no endless retries)", async () => {
      leadRows.push({ ...LEAD });
      for (let i = 0; i < 3; i++) activityRows.push(marker("lead_unused_reminder_2d_failed"));
      const json = await run();
      expect(json.unusedLeads).toMatchObject({ eligible: 0, excluded: { attempts_exhausted: 1 } });
      expect(send).not.toHaveBeenCalled();
    });

    it("a stale claim (crash after send, before the marker) never causes a second send: the claim is lost, the lead is counted as already reminded", async () => {
      reminderClaims.add("lead-unused-reminder:lead-u1");
      leadRows.push({ ...LEAD });
      const json = await run();
      expect(json.unusedLeads).toMatchObject({ eligible: 1, sent: 0, alreadyReminded: 1 });
      expect(send).not.toHaveBeenCalled();
    });

    it("a failed-marker write failure does not break the run", async () => {
      send.mockResolvedValue({ sent: false, reason: "http_500" });
      addActivity.mockRejectedValue(new Error("db down"));
      leadRows.push({ ...LEAD });
      const res = await GET(request("Bearer test-secret"));
      expect(res.status).toBe(200);
      expect(releaseClaim).toHaveBeenCalledWith("lead-unused-reminder:lead-u1");
    });
  });

  describe("concurrency", () => {
    it.each([2, 4])("with %i concurrent cron workers, an unused lead is reminded exactly ONCE", async (N) => {
      leadRows.push({ ...LEAD });
      const results = await Promise.all(Array.from({ length: N }, () => GET(request("Bearer test-secret"))));
      expect(send.mock.calls.filter((c) => c[0] === "+91 90000 00000")).toHaveLength(1);
      expect(send.mock.calls.filter((c) => c[0] === "+91 98888 12345")).toHaveLength(1);
      expect(addActivity).toHaveBeenCalledTimes(1);
      for (const r of results) expect(r.status).toBe(200);
    });

    it("two leads becoming eligible in the same run are each reminded once", async () => {
      leadRows.push({ ...LEAD, id: "lead-a", email: "a@example.com", phone: "+91 90000 11111" });
      leadRows.push({ ...LEAD, id: "lead-b", email: "b@example.com", phone: "+91 90000 22222" });
      const json = await run();
      expect(json.unusedLeads.sent).toBe(2);
      expect(addActivity).toHaveBeenCalledTimes(2);
    });
  });

  describe("tenant safety", () => {
    it("never notifies an owner from another company or a deleted owner — the lead is still nudged", async () => {
      employeeRows.length = 0;
      employeeRows.push({ ...OWNER, company_id: "OTHER" });
      leadRows.push({ ...LEAD });
      let json = await run();
      expect(json.unusedLeads.sent).toBe(1);
      expect(send).toHaveBeenCalledTimes(1);
      expect(send.mock.calls[0][0]).toBe("+91 98888 12345");
      expect(addActivity).toHaveBeenCalledWith("lead-u1", "c1", "NOTE", "lead_unused_reminder_2d", undefined, expect.objectContaining({ channels: expect.objectContaining({ ownerWhatsapp: "skipped" }) }));

      jest.clearAllMocks();
      reminderClaims.clear();
      send.mockResolvedValue({ sent: true });
      addActivity.mockResolvedValue({});
      employeeRows.length = 0;
      employeeRows.push({ ...OWNER, deleted_at: new Date().toISOString() });
      json = await run();
      expect(send).toHaveBeenCalledTimes(1);
      expect(send.mock.calls[0][0]).toBe("+91 98888 12345");
    });

    it("the marker is written against the lead's OWN company", async () => {
      leadRows.push({ ...LEAD, company_id: "c-lead" });
      employeeRows.length = 0;
      employeeRows.push({ ...OWNER, company_id: "c-lead" });
      await run();
      expect(addActivity).toHaveBeenCalledWith("lead-u1", "c-lead", "NOTE", "lead_unused_reminder_2d", undefined, expect.anything());
    });

    it("ignores every request parameter — the sweep is identical with crafted companyId/employeeId/leadId", async () => {
      leadRows.push({ ...LEAD });
      const res = await GET(new NextRequest("http://localhost/api/cron/reminders?companyId=evil&employeeId=evil&leadId=evil&limit=1000", { headers: { authorization: "Bearer test-secret" } }));
      const json = await res.json();
      expect(res.status).toBe(200);
      expect(json.unusedLeads.sent).toBe(1);
      expect(addActivity).toHaveBeenCalledWith("lead-u1", "c1", "NOTE", "lead_unused_reminder_2d", undefined, expect.anything());
    });

    it("stays a no-op without any configured provider (delivery externally gated)", async () => {
      isConfigured.mockReturnValue(false);
      leadRows.push({ ...LEAD });
      const json = await run();
      expect(json).toEqual({ processed: 0, skipped: "notifications_unconfigured" });
      expect(send).not.toHaveBeenCalled();
    });
  });
});
