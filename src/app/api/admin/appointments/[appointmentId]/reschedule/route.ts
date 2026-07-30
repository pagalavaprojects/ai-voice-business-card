import { NextRequest } from "next/server";
import { z } from "zod";
import { formatApiResponse } from "@/shared/lib/security";
import { handleApiError } from "@/shared/lib/apiHandler";
import { requireCompanyAccess } from "@/shared/lib/tenant";
import { SupabaseBookingRepository } from "@/core/infrastructure/database/supabase/SupabaseBookingRepository";
import { CalcomAdapter } from "@/core/infrastructure/booking/calcom/CalcomAdapter";

const bookingRepo = new SupabaseBookingRepository();
const calcom = new CalcomAdapter();

const RescheduleSchema = z.object({
  company_id: z.string().uuid(),
  start_time: z.string().datetime(),
  end_time: z.string().datetime(),
});

export async function PUT(req: NextRequest, { params }: { params: { appointmentId: string } }) {
  try {
    const body = await req.json();
    const parsed = RescheduleSchema.parse(body);

    await requireCompanyAccess(req, parsed.company_id, "write:appointments");

    const existing = await bookingRepo.getAppointmentById(params.appointmentId);
    if (!existing || existing.company_id !== parsed.company_id) return formatApiResponse(null, 404, "Appointment not found");

    if (existing.calcom_booking_id) {
      await calcom.rescheduleBooking(existing.calcom_booking_id, parsed.start_time, parsed.end_time);
    }

    const updated = await bookingRepo.rescheduleAppointment(params.appointmentId, parsed.start_time, parsed.end_time);
    return formatApiResponse(updated, 200, "Appointment rescheduled successfully");
  } catch (error) {
    return handleApiError(error);
  }
}
