import { ToolRegistry } from "@/core/application/tools/ToolRegistry";
import { CalcomAdapter, CalcomUnavailableError } from "@/core/infrastructure/booking/calcom/CalcomAdapter";
import { AppointmentStatus } from "@/core/domain/models/types";
import { APPOINTMENT_CONFIRMED_CLOSING } from "@/features/voice/lib/qualificationScript";

/**
 * Regression tests for the most serious defect found in the production audit:
 * book_appointment wrote a row to the appointments table, never called
 * Cal.com, and told the caller "Appointment successfully scheduled" while
 * emailing them "Your meeting is confirmed".
 *
 * No calendar event existed, no invite was sent, and nobody would have been
 * on the call. These tests pin the two behaviours that matter: a real booking
 * when a calendar is available, and an honest REQUESTED capture when it isn't.
 */
const LEAD = { id: "lead-1", name: "Test Visitor", email: "visitor@example.com" };

function makeRegistry(calcom?: CalcomAdapter, eventTypeId?: number) {
  const created: Record<string, unknown>[] = [];
  const crmRepo = { getLeadById: jest.fn().mockResolvedValue(LEAD) } as never;
  const bookingRepo = {
    createAppointment: jest.fn(async (data: Record<string, unknown>) => {
      created.push(data);
      return { id: "appt-1", start_time: "2026-09-01T10:00:00.000Z", status: data.status ?? "BOOKED", meeting_url: data.meeting_url };
    }),
  } as never;
  const knowledgeRepo = {} as never;
  const registry = new ToolRegistry(crmRepo, bookingRepo, knowledgeRepo, undefined, calcom, eventTypeId);
  return { registry, created };
}

const ARGS = { lead_id: "lead-1", start_time: "2026-09-01T10:00:00.000Z", end_time: "2026-09-01T10:30:00.000Z" };
const CTX = { companyId: "company-1", employeeId: "employee-1" };

describe("book_appointment", () => {
  it("creates a REAL Cal.com booking and stores its id and meeting URL", async () => {
    const calcom = {
      createBooking: jest.fn().mockResolvedValue({ id: 7, uid: "cal_real_abc", title: "Meeting", meetingUrl: "https://meet.example/xyz", status: "ACCEPTED" }),
    } as unknown as CalcomAdapter;

    const { registry, created } = makeRegistry(calcom, 12345);
    const result = await registry.getTool("book_appointment")!.execute(ARGS, CTX);

    expect(calcom.createBooking).toHaveBeenCalledTimes(1);
    expect(created[0].calcom_booking_id).toBe("cal_real_abc");
    expect(created[0].meeting_url).toBe("https://meet.example/xyz");
    expect(created[0].status).toBe(AppointmentStatus.BOOKED);
    expect(result.confirmed).toBe(true);
    expect(String(result.message)).toMatch(/confirmed/i);
  });

  // Regression: the closing line used to live only inside the `message`
  // prose, which the model had to reproduce correctly from an embedded
  // quote. It now lives in its own `speak` field — the same deterministic
  // mechanism get_next_qualification_question's six-question completion
  // already uses — present ONLY on a genuinely confirmed booking, exact
  // capitalization and punctuation preserved, never generated on any other
  // path.
  describe("the confirmed-only `speak` closing line", () => {
    it("is present and byte-exact when Cal.com genuinely confirms the booking", async () => {
      const calcom = {
        createBooking: jest.fn().mockResolvedValue({ id: 7, uid: "cal_real_abc", title: "Meeting", meetingUrl: "https://meet.example/xyz", status: "ACCEPTED" }),
      } as unknown as CalcomAdapter;

      const { registry } = makeRegistry(calcom, 12345);
      const result = await registry.getTool("book_appointment")!.execute(ARGS, CTX);

      expect(result.confirmed).toBe(true);
      expect(result.speak).toBe(APPOINTMENT_CONFIRMED_CLOSING);
      expect(result.speak).toBe("Thank You for Your Valuable Time and Support. Have a Wonderful Day");
      expect(String(result.message)).toMatch(/SPEAK the "speak" text EXACTLY/);
    });

    it("is absent on a REQUESTED (Cal.com unavailable) fallback", async () => {
      const calcom = {
        createBooking: jest.fn().mockRejectedValue(new CalcomUnavailableError()),
      } as unknown as CalcomAdapter;

      const { registry } = makeRegistry(calcom, 12345);
      const result = await registry.getTool("book_appointment")!.execute(ARGS, CTX);

      expect(result.confirmed).toBe(false);
      expect(result.speak).toBeUndefined();
    });

    it("is absent when Cal.com errors (calendar outage)", async () => {
      const calcom = {
        createBooking: jest.fn().mockRejectedValue(new Error("cal.com 503")),
      } as unknown as CalcomAdapter;

      const { registry } = makeRegistry(calcom, 12345);
      const result = await registry.getTool("book_appointment")!.execute(ARGS, CTX);

      expect(result.confirmed).toBe(false);
      expect(result.speak).toBeUndefined();
    });

    it("is absent when no event type is configured (no booking attempted)", async () => {
      const calcom = { createBooking: jest.fn() } as unknown as CalcomAdapter;

      const { registry } = makeRegistry(calcom, undefined);
      const result = await registry.getTool("book_appointment")!.execute(ARGS, CTX);

      expect(result.confirmed).toBe(false);
      expect(result.speak).toBeUndefined();
    });
  });

  it("captures REQUESTED — and does not claim confirmation — when Cal.com is unconfigured", async () => {
    const calcom = {
      createBooking: jest.fn().mockRejectedValue(new CalcomUnavailableError()),
    } as unknown as CalcomAdapter;

    const { registry, created } = makeRegistry(calcom, 12345);
    const result = await registry.getTool("book_appointment")!.execute(ARGS, CTX);

    expect(created[0].status).toBe(AppointmentStatus.REQUESTED);
    expect(created[0].calcom_booking_id).toBeUndefined();
    expect(result.confirmed).toBe(false);
    // The exact wording matters: this is what the assistant says out loud.
    expect(String(result.message)).not.toMatch(/confirmed/i);
    expect(String(result.message)).toMatch(/noted|shortly/i);
  });

  it("still records the visitor's preferred time when the calendar errors — the lead is not lost", async () => {
    const calcom = {
      createBooking: jest.fn().mockRejectedValue(new Error("cal.com 503")),
    } as unknown as CalcomAdapter;

    const { registry, created } = makeRegistry(calcom, 12345);
    const result = await registry.getTool("book_appointment")!.execute(ARGS, CTX);

    expect(created).toHaveLength(1);
    expect(created[0].start_time).toBe(ARGS.start_time);
    expect(result.success).toBe(true);
    expect(result.confirmed).toBe(false);
  });

  it("does not attempt a booking when no event type is configured", async () => {
    const calcom = { createBooking: jest.fn() } as unknown as CalcomAdapter;

    const { registry, created } = makeRegistry(calcom, undefined);
    await registry.getTool("book_appointment")!.execute(ARGS, CTX);

    expect(calcom.createBooking).not.toHaveBeenCalled();
    expect(created[0].status).toBe(AppointmentStatus.REQUESTED);
  });
});

describe("company Settings actually drive the booking", () => {
  /** Before this, calendar_settings.event_type_id and email_settings.sender_name
   * were written by the Settings page and read by nothing: every tenant booked
   * against the CALCOM_EVENT_TYPE_ID env var and every email went out under the
   * platform's own name. Both fields looked configurable and changed nothing. */
  function makeRegistryWithSettings(settings: Record<string, unknown> | null, envEventTypeId?: number) {
    const calcom = {
      createBooking: jest.fn().mockResolvedValue({ id: 7, uid: "cal_abc", title: "Meeting", meetingUrl: "https://meet.example/x", status: "ACCEPTED" }),
    } as unknown as CalcomAdapter;
    const sent: Record<string, unknown>[] = [];
    const notificationService = {
      send: jest.fn(async (request: Record<string, unknown>) => {
        sent.push(request);
        return { success: true };
      }),
    } as never;
    const settingsRepo = { getSettings: jest.fn().mockResolvedValue(settings) } as never;
    const crmRepo = { getLeadById: jest.fn().mockResolvedValue(LEAD) } as never;
    const bookingRepo = {
      createAppointment: jest.fn(async (data: Record<string, unknown>) => ({
        id: "appt-1",
        start_time: "2026-09-01T10:00:00.000Z",
        status: data.status,
        meeting_url: data.meeting_url,
      })),
    } as never;

    const registry = new ToolRegistry(crmRepo, bookingRepo, {} as never, notificationService, calcom, envEventTypeId, settingsRepo);
    return { registry, calcom, sent };
  }

  it("books against the company's configured event type, not the platform env var", async () => {
    const { registry, calcom } = makeRegistryWithSettings({ calendar_settings: { event_type_id: 999 } }, 12345);

    await registry.getTool("book_appointment")!.execute(ARGS, CTX);

    expect(calcom.createBooking).toHaveBeenCalledWith(expect.objectContaining({ eventTypeId: 999 }));
  });

  it("falls back to the platform event type when the company has not set one", async () => {
    const { registry, calcom } = makeRegistryWithSettings({ calendar_settings: {} }, 12345);

    await registry.getTool("book_appointment")!.execute(ARGS, CTX);

    expect(calcom.createBooking).toHaveBeenCalledWith(expect.objectContaining({ eventTypeId: 12345 }));
  });

  it("sends the confirmation under the company's configured sender name", async () => {
    const { registry, sent } = makeRegistryWithSettings(
      { calendar_settings: { event_type_id: 999 }, email_settings: { sender_name: "Pagalava Data Analytics" } },
      undefined
    );

    await registry.getTool("book_appointment")!.execute(ARGS, CTX);

    expect(sent[0].fromName).toBe("Pagalava Data Analytics");
  });

  it("still books when the settings lookup fails — a settings outage must not lose the meeting", async () => {
    const calcom = {
      createBooking: jest.fn().mockResolvedValue({ id: 7, uid: "cal_abc", title: "M", meetingUrl: "https://m/x", status: "ACCEPTED" }),
    } as unknown as CalcomAdapter;
    const settingsRepo = { getSettings: jest.fn().mockRejectedValue(new Error("settings unreachable")) } as never;
    const crmRepo = { getLeadById: jest.fn().mockResolvedValue(LEAD) } as never;
    const bookingRepo = {
      createAppointment: jest.fn(async (data: Record<string, unknown>) => ({ id: "a1", start_time: "x", status: data.status })),
    } as never;

    const registry = new ToolRegistry(crmRepo, bookingRepo, {} as never, undefined, calcom, 12345, settingsRepo);
    const result = await registry.getTool("book_appointment")!.execute(ARGS, CTX);

    expect(calcom.createBooking).toHaveBeenCalledWith(expect.objectContaining({ eventTypeId: 12345 }));
    expect(result.confirmed).toBe(true);
  });
});

describe("CalcomAdapter.createBooking when unconfigured", () => {
  it("throws instead of returning a fabricated booking", async () => {
    process.env = { ...process.env, CALCOM_API_KEY: "calcom-api-key" }; // placeholder
    const adapter = new CalcomAdapter();

    // Previously returned { uid: "cal_demo_...", meetingUrl:
    // "https://cal.com/demo-meeting", status: "ACCEPTED" } — a convincing lie
    // that callers stored and reported as a confirmed meeting.
    await expect(
      adapter.createBooking({
        eventTypeId: 1,
        start: ARGS.start_time,
        end: ARGS.end_time,
        responses: { name: "x", email: "x@example.com" },
        timeZone: "UTC",
      })
    ).rejects.toThrow(CalcomUnavailableError);
  });
});
