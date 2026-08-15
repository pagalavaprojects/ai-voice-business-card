/**
 * book_appointment's dual confirmation notifications (client + owner over
 * WhatsApp and email): awaited (not droppable fire-and-forget), idempotent
 * per appointment+recipient+channel, confirmation-gated, and NEVER able to
 * affect the booking result itself.
 */
import { ToolRegistry } from "@/core/application/tools/ToolRegistry";
import { CalcomAdapter } from "@/core/infrastructure/booking/calcom/CalcomAdapter";
import { buildAppointmentConfirmedSpeech } from "@/features/voice/lib/qualificationScript";

const whatsappSend = jest.fn();
const whatsappConfigured = jest.fn().mockReturnValue(true);
jest.mock("@/core/infrastructure/notifications/WhatsAppNotifier", () => ({
  getWhatsAppNotifier: () => ({ isConfigured: whatsappConfigured, send: whatsappSend }),
}));

const claimMessage = jest.fn();
jest.mock("@/core/infrastructure/notifications/WhatsAppIdempotency", () => ({
  SupabaseWhatsAppIdempotencyStore: jest.fn().mockImplementation(() => ({ claimMessage })),
}));

const LEAD = { id: "lead-1", name: "Asha Client", email: "asha@example.com", phone: "+911111111111" };
const EMPLOYEE = { id: "employee-1", name: "Owner", email: "owner@pagalava.com", phone: "+912222222222" };

function makeRegistry(opts: { confirmed?: boolean; emailService?: boolean } = {}) {
  const { confirmed = true, emailService = true } = opts;
  const activities: Record<string, unknown>[] = [];
  const crmRepo = {
    getLeadById: jest.fn().mockResolvedValue(LEAD),
    addActivity: jest.fn(async (...a: unknown[]) => {
      activities.push({ args: a });
      return {};
    }),
  } as never;
  const bookingRepo = {
    createAppointment: jest.fn(async (data: Record<string, unknown>) => ({
      id: "appt-1",
      start_time: "2026-09-01T10:00:00.000Z",
      status: data.status,
      meeting_url: data.meeting_url,
    })),
  } as never;
  const knowledgeRepo = { getEmployeeById: jest.fn().mockResolvedValue(EMPLOYEE) } as never;
  const emailSend = jest.fn().mockResolvedValue({ success: true });
  const notificationService = emailService ? ({ send: emailSend } as never) : undefined;
  const calcom = {
    createBooking: confirmed
      ? jest.fn().mockResolvedValue({ id: 7, uid: "cal_abc", title: "Meeting", meetingUrl: "https://meet.example/xyz", status: "ACCEPTED" })
      : jest.fn().mockRejectedValue(new Error("cal.com 503")),
  } as unknown as CalcomAdapter;
  const registry = new ToolRegistry(crmRepo, bookingRepo, knowledgeRepo, notificationService, calcom, 12345);
  return { registry, emailSend, activities };
}

const ARGS = { lead_id: "lead-1", start_time: "2026-09-01T10:00:00.000Z", end_time: "2026-09-01T10:30:00.000Z" };
const CTX = { companyId: "company-1", employeeId: "employee-1" };

beforeEach(() => {
  whatsappSend.mockReset().mockResolvedValue({ sent: true });
  whatsappConfigured.mockReturnValue(true);
  claimMessage.mockReset().mockResolvedValue(true);
});

describe("book_appointment — confirmed booking notifies BOTH client and owner", () => {
  it("sends client WhatsApp (canonical three-part text + real meeting link) and owner WhatsApp (structured, Status: CONFIRMED)", async () => {
    const { registry } = makeRegistry();
    const result = await registry.getTool("book_appointment")!.execute(ARGS, CTX);
    expect(result.confirmed).toBe(true);

    const clientCall = whatsappSend.mock.calls.find(([to]) => to === LEAD.phone)!;
    expect(clientCall).toBeTruthy();
    const clientMsg = String(clientCall[1]);
    expect(clientMsg).toContain("Appointment Confirmed!");
    expect(clientMsg).toContain("Thank You for Your Valuable Time and Support. Have a Wonderful Day");
    expect(clientMsg).toContain("Preferred time:");
    expect(clientMsg).toContain("Meeting: https://meet.example/xyz");
    // The canonical builder is the source of the three-part text.
    expect(clientMsg.startsWith(buildAppointmentConfirmedSpeech("").split("Preferred time:")[0].trim().slice(0, 22))).toBe(true);

    const ownerCall = whatsappSend.mock.calls.find(([to]) => to === EMPLOYEE.phone)!;
    expect(ownerCall).toBeTruthy();
    const ownerMsg = String(ownerCall[1]);
    expect(ownerMsg).toContain("Appointment Confirmed");
    expect(ownerMsg).toContain(`Client: ${LEAD.name}`);
    expect(ownerMsg).toContain(`Email: ${LEAD.email}`);
    expect(ownerMsg).toContain(`Phone: ${LEAD.phone}`);
    expect(ownerMsg).toContain("Status: CONFIRMED");
    expect(ownerMsg).toContain("Meeting: https://meet.example/xyz");
  });

  it("both messages carry the SAME real appointment time in the requested timezone", async () => {
    const { registry } = makeRegistry();
    await registry.getTool("book_appointment")!.execute({ ...ARGS, timezone: "Asia/Kolkata" }, CTX);
    const expectedWhen = new Date("2026-09-01T10:00:00.000Z").toLocaleString("en-US", {
      dateStyle: "full",
      timeStyle: "short",
      timeZone: "Asia/Kolkata",
    });
    const [clientMsg, ownerMsg] = [
      String(whatsappSend.mock.calls.find(([to]) => to === LEAD.phone)![1]),
      String(whatsappSend.mock.calls.find(([to]) => to === EMPLOYEE.phone)![1]),
    ];
    expect(clientMsg).toContain(expectedWhen);
    expect(ownerMsg).toContain(expectedWhen);
  });

  it("sends the client email AND the owner confirmed email through the existing service", async () => {
    const { registry, emailSend } = makeRegistry();
    await registry.getTool("book_appointment")!.execute(ARGS, CTX);
    const recipients = emailSend.mock.calls.map(([req]) => (req as { to: string }).to);
    expect(recipients).toContain(LEAD.email);
    expect(recipients).toContain(EMPLOYEE.email);
    const ownerEmail = emailSend.mock.calls.find(([req]) => (req as { to: string }).to === EMPLOYEE.email)![0] as { subject: string; html: string };
    expect(ownerEmail.subject).toContain("New appointment confirmed");
    expect(ownerEmail.html).toContain("Status:</strong> CONFIRMED");
  });

  it("records an audit activity on the lead timeline with per-channel outcomes", async () => {
    const { registry, activities } = makeRegistry();
    await registry.getTool("book_appointment")!.execute(ARGS, CTX);
    expect(activities).toHaveLength(1);
    const meta = (activities[0].args as unknown[])[5] as { appointmentId: string; outcomes: Record<string, string> };
    expect(meta.appointmentId).toBe("appt-1");
    expect(meta.outcomes["client:whatsapp"]).toBe("sent");
    expect(meta.outcomes["owner:whatsapp"]).toBe("sent");
    expect(meta.outcomes["client:email"]).toBe("sent");
    expect(meta.outcomes["owner:email"]).toBe("sent");
  });
});

describe("book_appointment — failure isolation (notifications can never break the booking)", () => {
  it("client WhatsApp failure: booking stays confirmed, owner is still notified, failure recorded", async () => {
    whatsappSend.mockImplementation(async (to: string) =>
      to === LEAD.phone ? Promise.reject(new Error("meta down")) : { sent: true }
    );
    const { registry, activities } = makeRegistry();
    const result = await registry.getTool("book_appointment")!.execute(ARGS, CTX);
    expect(result.confirmed).toBe(true);
    expect(result.speak).toBeDefined();
    expect(whatsappSend.mock.calls.some(([to]) => to === EMPLOYEE.phone)).toBe(true);
    const meta = (activities[0].args as unknown[])[5] as { outcomes: Record<string, string> };
    expect(meta.outcomes["client:whatsapp"]).toBe("failed:exception");
    expect(meta.outcomes["owner:whatsapp"]).toBe("sent");
  });

  it("owner WhatsApp failure: booking stays confirmed, client still notified", async () => {
    whatsappSend.mockImplementation(async (to: string) =>
      to === EMPLOYEE.phone ? { sent: false, reason: "http_401" } : { sent: true }
    );
    const { registry, activities } = makeRegistry();
    const result = await registry.getTool("book_appointment")!.execute(ARGS, CTX);
    expect(result.confirmed).toBe(true);
    const meta = (activities[0].args as unknown[])[5] as { outcomes: Record<string, string> };
    expect(meta.outcomes["owner:whatsapp"]).toBe("failed:http_401");
    expect(meta.outcomes["client:whatsapp"]).toBe("sent");
  });

  it("EVERY channel failing still returns a confirmed booking with honest failure records", async () => {
    whatsappSend.mockResolvedValue({ sent: false, reason: "unconfigured" });
    const { registry, emailSend, activities } = makeRegistry();
    emailSend.mockResolvedValue({ success: false, error: "no api key" });
    const result = await registry.getTool("book_appointment")!.execute(ARGS, CTX);
    expect(result.confirmed).toBe(true);
    expect(result.speak).toBeDefined();
    const meta = (activities[0].args as unknown[])[5] as { outcomes: Record<string, string> };
    for (const v of Object.values(meta.outcomes)) expect(v).toMatch(/^failed:/);
  });
});

describe("book_appointment — idempotency and confirmation gating", () => {
  it("an already-claimed notification key is never sent again (retry safety)", async () => {
    claimMessage.mockResolvedValue(false);
    const { registry, emailSend } = makeRegistry();
    const result = await registry.getTool("book_appointment")!.execute(ARGS, CTX);
    expect(result.confirmed).toBe(true);
    expect(whatsappSend).not.toHaveBeenCalled();
    expect(emailSend).not.toHaveBeenCalled();
  });

  it("claims use deterministic per-appointment+recipient+channel keys", async () => {
    const { registry } = makeRegistry();
    await registry.getTool("book_appointment")!.execute(ARGS, CTX);
    const keys = claimMessage.mock.calls.map(([k]) => k).sort();
    expect(keys).toEqual([
      "appt-notify:appt-1:client:email",
      "appt-notify:appt-1:client:whatsapp",
      "appt-notify:appt-1:owner:email",
      "appt-notify:appt-1:owner:whatsapp",
    ]);
  });

  it("a Cal.com failure (REQUESTED) never sends the confirmed texts — no canonical phrase, no Status: CONFIRMED, no owner email", async () => {
    const { registry, emailSend } = makeRegistry({ confirmed: false });
    const result = await registry.getTool("book_appointment")!.execute(ARGS, CTX);
    expect(result.confirmed).toBe(false);
    for (const [, msg] of whatsappSend.mock.calls) {
      expect(String(msg)).not.toContain("Appointment Confirmed!");
      expect(String(msg)).not.toContain("Status: CONFIRMED");
    }
    // Client REQUESTED note is honest; owner gets the REQUESTED heads-up.
    expect(String(whatsappSend.mock.calls.find(([to]) => to === LEAD.phone)![1])).toContain("A confirmation will follow shortly");
    expect(String(whatsappSend.mock.calls.find(([to]) => to === EMPLOYEE.phone)![1])).toContain("REQUESTED");
    // Owner email is confirmed-only.
    expect(emailSend.mock.calls.map(([r]) => (r as { to: string }).to)).not.toContain(EMPLOYEE.email);
  });

  it("meeting link appears ONLY when the real booking has one", async () => {
    const { registry } = makeRegistry();
    const calcomNoUrl = {
      createBooking: jest.fn().mockResolvedValue({ id: 8, uid: "cal_nourl", title: "Meeting", status: "ACCEPTED" }),
    } as unknown as CalcomAdapter;
    void registry;
    const bare = (() => {
      const { registry: r2 } = makeRegistry();
      void r2;
      const crmRepo = { getLeadById: jest.fn().mockResolvedValue(LEAD), addActivity: jest.fn().mockResolvedValue({}) } as never;
      const bookingRepo = {
        createAppointment: jest.fn(async (data: Record<string, unknown>) => ({
          id: "appt-2",
          start_time: "2026-09-01T10:00:00.000Z",
          status: data.status,
          meeting_url: undefined,
        })),
      } as never;
      const knowledgeRepo = { getEmployeeById: jest.fn().mockResolvedValue(EMPLOYEE) } as never;
      return new ToolRegistry(crmRepo, bookingRepo, knowledgeRepo, undefined, calcomNoUrl, 12345);
    })();
    await bare.getTool("book_appointment")!.execute(ARGS, CTX);
    for (const [, msg] of whatsappSend.mock.calls) {
      expect(String(msg)).not.toContain("Meeting:");
    }
  });
});
