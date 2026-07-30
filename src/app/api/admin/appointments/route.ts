import { NextRequest } from "next/server";
import { z } from "zod";
import { formatApiResponse } from "@/shared/lib/security";
import { handleApiError } from "@/shared/lib/apiHandler";
import { requireCompanyAccess } from "@/shared/lib/tenant";
import { SupabaseBookingRepository } from "@/core/infrastructure/database/supabase/SupabaseBookingRepository";
import { CalcomAdapter } from "@/core/infrastructure/booking/calcom/CalcomAdapter";
import { AppointmentStatus } from "@/core/domain/models/types";

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

    await requireCompanyAccess(req, companyId, "read:appointments");

    const status = req.nextUrl.searchParams.get("status") as AppointmentStatus | null;
    const employeeId = req.nextUrl.searchParams.get("employeeId") || undefined;
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

    const calcomBooking = await calcom.createBooking({
      eventTypeId: parsed.event_type_id,
      start: parsed.start_time,
      end: parsed.end_time,
      responses: { name: parsed.attendee_name, email: parsed.attendee_email },
      timeZone: parsed.timezone,
    });

    const appointment = await bookingRepo.createAppointment({
      company_id: parsed.company_id,
      employee_id: parsed.employee_id,
      lead_id: parsed.lead_id,
      start_time: parsed.start_time,
      end_time: parsed.end_time,
      calcom_booking_id: calcomBooking.uid,
      meeting_url: calcomBooking.meetingUrl,
    });

    return formatApiResponse(appointment, 201, calcom.isConfigured() ? "Appointment booked via Cal.com" : "Appointment booked (Cal.com demo mode — Requires Live Infrastructure)");
  } catch (error) {
    return handleApiError(error);
  }
}
