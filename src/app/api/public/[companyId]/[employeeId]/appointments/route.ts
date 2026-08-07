import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { toolRegistry } from "@/core/infrastructure/bootstrap/assistantRuntime";
import { CalcomAdapter } from "@/core/infrastructure/booking/calcom/CalcomAdapter";
import { checkRateLimitDistributed } from "@/shared/lib/rateLimit";
import { Logger } from "@/shared/lib/logger";

// Reads live availability and writes real bookings on every request — a
// public, unauthenticated, write-capable endpoint has nothing safe to cache.
export const dynamic = "force-dynamic";

const calcom = new CalcomAdapter();

// 30 minutes matches the "30-minute discovery consultation" copy the
// booking modal already shows the visitor — kept as one constant so the
// slot list and the actual booked duration can never drift apart.
const MEETING_DURATION_MS = 30 * 60 * 1000;
const SLOT_WINDOW_DAYS = 7;

const BookRequestSchema = z.object({
  name: z.string().trim().min(1).max(200),
  email: z.string().trim().email(),
  phone: z.string().trim().min(3).max(50),
  notes: z.string().trim().max(2000).optional(),
  startTime: z.string().min(1),
  timeZone: z.string().trim().min(1).max(100).default("UTC"),
});

/** A visitor who scans the same card repeatedly (or a script) can only spam
 * a handful of requests a minute — real availability barely changes that
 * fast, and a real human filling out the form once is nowhere near this
 * limit. Keyed by IP: there's no authenticated identity on this route, same
 * reasoning as the edge middleware's admin-route limiter.
 *
 * GET gets a much looser limit than POST — it's read-only, but it still
 * triggers a real outbound Cal.com API call (or a settings DB read) on
 * every request with caching disabled, so it isn't free to leave
 * unbounded either. */
async function enforceRateLimit(req: NextRequest, bucket: "read" | "write", limit: number): Promise<boolean> {
  const identifier = req.headers.get("x-forwarded-for") || "unknown";
  // Separate buckets per verb: GET's much looser limit must never share a
  // counter with POST's strict one, or a visitor innocently reloading the
  // slot picker a few times would burn through the booking-attempt budget
  // and get incorrectly locked out of submitting the form.
  const { allowed } = await checkRateLimitDistributed(`public-booking-${bucket}:${identifier}`, limit, 10 * 60_000);
  return allowed;
}

/**
 * Available time slots for this employee's meeting calendar.
 *
 * Deliberately reuses CalcomAdapter.getAvailableSlots's own existing
 * demo-mode fallback (three plausible slots starting tomorrow) rather than
 * branching on isConfigured() here — the honesty boundary for this feature
 * is at booking time (see POST below), not at slot-display time: showing
 * proposed times is not itself a claim that a meeting exists yet.
 */
export async function GET(req: NextRequest, { params }: { params: { companyId: string; employeeId: string } }) {
  if (!(await enforceRateLimit(req, "read", 30))) {
    return NextResponse.json({ configured: false, slots: [], reason: "rate_limited" }, { status: 429 });
  }

  try {
    const { eventTypeId } = await toolRegistry.resolveCompanyDefaults(params.companyId);
    if (!eventTypeId) {
      // A real Cal.com key is linked but no event type is configured
      // anywhere (company settings or CALCOM_EVENT_TYPE_ID) — there is
      // nothing to show demo slots against, and calling the real API
      // with an undefined event type would just fail. This is the one
      // case with genuinely no slots to offer, and it's distinct from an
      // outage below: the modal shows different copy for each so a
      // transient Cal.com failure doesn't get misreported to the visitor
      // as "this company doesn't support online booking."
      return NextResponse.json({ configured: false, slots: [], reason: "unconfigured" });
    }

    const timeZone = req.nextUrl.searchParams.get("timeZone") || "UTC";
    const now = new Date();
    const windowEnd = new Date(now.getTime() + SLOT_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    const slots = await calcom.getAvailableSlots(eventTypeId, now.toISOString(), windowEnd.toISOString(), timeZone);

    return NextResponse.json({ configured: calcom.isConfigured(), slots });
  } catch (err) {
    Logger.warn("Failed to load appointment slots for public booking widget", {
      companyId: params.companyId,
      employeeId: params.employeeId,
      error: err instanceof Error ? err.message : String(err),
    });
    // A slots outage should hide the picker, not crash the card — but it
    // must not be reported the same way as "unconfigured" above, or a
    // temporary Cal.com blip reads to the visitor as a permanent limitation.
    return NextResponse.json({ configured: false, slots: [], reason: "error" });
  }
}

/**
 * Books a meeting from the public card's manual "Book an Appointment"
 * modal — the non-voice counterpart to the AI's own save_lead +
 * book_appointment tool calls.
 *
 * Deliberately executes the SAME registered tools the live voice call uses
 * (toolRegistry.getTool("save_lead"/"book_appointment")) instead of
 * reimplementing lead creation and Cal.com booking here. That is what
 * guarantees this form can never drift into a second, less honest booking
 * path: the exact same "attempt a real Cal.com booking, fall back to a
 * REQUESTED row with an honest email" behavior from ToolRegistry.ts
 * applies here unchanged, tool-call analytics see one consistent source,
 * and a future fix to that logic covers both entry points automatically.
 */
export async function POST(req: NextRequest, { params }: { params: { companyId: string; employeeId: string } }) {
  if (!(await enforceRateLimit(req, "write", 8))) {
    return NextResponse.json({ success: false, message: "Too many requests — please try again in a few minutes." }, { status: 429 });
  }

  const body = await req.json().catch(() => null);
  const parsed = BookRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ success: false, message: "Please check the form and try again.", errors: parsed.error.flatten() }, { status: 400 });
  }

  const { name, email, phone, notes, timeZone } = parsed.data;
  const start = new Date(parsed.data.startTime);
  if (Number.isNaN(start.getTime()) || start.getTime() < Date.now() - 60_000) {
    return NextResponse.json({ success: false, message: "Please choose a valid, upcoming time." }, { status: 400 });
  }
  const end = new Date(start.getTime() + MEETING_DURATION_MS);

  const saveLeadTool = toolRegistry.getTool("save_lead");
  const bookAppointmentTool = toolRegistry.getTool("book_appointment");
  if (!saveLeadTool || !bookAppointmentTool) {
    // Should be unreachable — both are registered unconditionally in
    // assistantRuntime.ts — but a missing tool must fail loudly rather
    // than silently pretending to book something.
    Logger.error("Public booking route: save_lead/book_appointment tool missing from registry");
    return NextResponse.json({ success: false, message: "Booking is temporarily unavailable. Please contact us directly." }, { status: 503 });
  }

  const context = { companyId: params.companyId, employeeId: params.employeeId };

  try {
    const leadResult = await saveLeadTool.execute(
      { name, email, phone, ...(notes ? { problem_statement: notes } : {}) },
      context
    );
    const leadId = leadResult.lead_id as string | undefined;
    if (!leadId) throw new Error("save_lead did not return a lead_id");

    const bookingResult = await bookAppointmentTool.execute(
      { lead_id: leadId, start_time: start.toISOString(), end_time: end.toISOString(), timezone: timeZone },
      context
    );

    // confirmed/status/message come straight from book_appointment's own
    // honest result shape — CONFIRMED with a real Cal.com event, or
    // REQUESTED with "a confirmation will follow shortly." Never rewritten
    // here into a more reassuring-sounding response.
    return NextResponse.json({
      success: true,
      confirmed: Boolean(bookingResult.confirmed),
      status: bookingResult.status,
      message: bookingResult.message,
    });
  } catch (err) {
    Logger.error("Public appointment booking failed", {
      companyId: params.companyId,
      employeeId: params.employeeId,
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { success: false, message: "We couldn't process your request — please try again or contact us directly." },
      { status: 500 }
    );
  }
}
