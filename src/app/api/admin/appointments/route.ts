import { NextRequest } from "next/server";
import { z } from "zod";
import { formatApiResponse } from "@/shared/lib/security";
import { handleApiError } from "@/shared/lib/apiHandler";
import { requireCompanyAccess, requireCompanyDataScope } from "@/shared/lib/tenant";
import { SupabaseBookingRepository } from "@/core/infrastructure/database/supabase/SupabaseBookingRepository";
import { CalcomAdapter } from "@/core/infrastructure/booking/calcom/CalcomAdapter";
import { AppointmentStatus } from "@/core/domain/models/types";
import { Logger } from "@/shared/lib/logger";

// Reads the session cookie and/or query params, so it can never be rendered
// statically. Declared explicitly to stop Next attempting a static pass that
// always throws "Dynamic server usage" — noise that buried real errors in the
// build log.
export const dynamic = "force-dynamic";


const bookingRepo = new SupabaseBookingRepository();
const calcom = new CalcomAdapter();

const CreateAppointmentBodySchema = z.object({
  company_id: z.string().uuid(),
  employee_id: z.string().uuid(),
  lead_id: z.string().uuid(),
  event_type_id: z.number().int(),
  start_time: z.string().datetime(),
  end_time: z.string().datetime(),
  timezone: z.string().default("UTC"),
  attendee_name: z.string().min(1),
  attendee_email: z.string().email(),
});

export async function GET(req: NextRequest) {
  try {
    const companyId = req.nextUrl.searchParams.get("companyId");
    if (!companyId) return formatApiResponse(null, 400, "companyId query parameter is required");

    const { employeeId: ownEmployeeId } = await requireCompanyDataScope(req, companyId, "read:appointments");

    const status = req.nextUrl.searchParams.get("status") as AppointmentStatus | null;
    // The client's employeeId is a convenience FILTER for someone entitled
    // to the whole company. For staff it is ignored entirely and replaced by
    // their own id, so it can never widen what they see.
    const requestedEmployeeId = req.nextUrl.searchParams.get("employeeId") || undefined;
    const employeeId = ownEmployeeId ?? requestedEmployeeId;
    const limit = Math.min(Number(req.nextUrl.searchParams.get("limit")) || 20, 100);
    const offset = Number(req.nextUrl.searchParams.get("offset")) || 0;

    const result = await bookingRepo.listAppointments({ company_id: companyId, status: status ?? undefined, employee_id: employeeId, limit, offset });
    return formatApiResponse(result, 200, "Appointments retrieved successfully");
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = CreateAppointmentBodySchema.parse(body);

    await requireCompanyAccess(req, parsed.company_id, "write:appointments");

    // Cal.com now throws rather than returning a fabricated booking, so an
    // unconfigured calendar produces an honest REQUESTED appointment instead
    // of a row carrying a synthetic booking id and a dead demo meeting URL.
    let calcomBookingId: string | undefined;
    let meetingUrl: string | undefined;
    let confirmed = false;

    try {
      const calcomBooking = await calcom.createBooking({
        eventTypeId: parsed.event_type_id,
        start: parsed.start_time,
        end: parsed.end_time,
        responses: { name: parsed.attendee_name, email: parsed.attendee_email },
        timeZone: parsed.timezone,
      });
      calcomBookingId = calcomBooking.uid;
      meetingUrl = calcomBooking.meetingUrl;
      confirmed = true;
    } catch (err) {
      Logger.warn("Cal.com booking unavailable; storing appointment as REQUESTED", {
        error: err instanceof Error ? err.message : String(err),
      });
    }

    const appointment = await bookingRepo.createAppointment({
      company_id: parsed.company_id,
      employee_id: parsed.employee_id,
      lead_id: parsed.lead_id,
      start_time: parsed.start_time,
      end_time: parsed.end_time,
      calcom_booking_id: calcomBookingId,
      meeting_url: meetingUrl,
      status: confirmed ? AppointmentStatus.BOOKED : AppointmentStatus.REQUESTED,
    });

    return formatApiResponse(
      appointment,
      201,
      confirmed
        ? "Appointment booked via Cal.com"
        : "Preferred time saved as a request — Cal.com is not configured, so no calendar invitation was sent"
    );
  } catch (error) {
    return handleApiError(error);
  }
}
