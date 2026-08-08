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

const appointmentRows: unknown[] = [];
jest.mock("@/shared/lib/supabase", () => ({
  supabaseAdmin: {
    from: () => ({
      select: () => ({
        gte: () => ({
          lte: () => ({
            in: () => ({ limit: async () => ({ data: appointmentRows, error: null }) }),
          }),
        }),
      }),
    }),
  },
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
});
