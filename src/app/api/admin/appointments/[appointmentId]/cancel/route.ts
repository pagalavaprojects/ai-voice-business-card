import { NextRequest } from "next/server";
import { z } from "zod";
import { formatApiResponse } from "@/shared/lib/security";
import { handleApiError } from "@/shared/lib/apiHandler";
import { requireCompanyAccess } from "@/shared/lib/tenant";
import { SupabaseBookingRepository } from "@/core/infrastructure/database/supabase/SupabaseBookingRepository";
import { CalcomAdapter } from "@/core/infrastructure/booking/calcom/CalcomAdapter";

const bookingRepo = new SupabaseBookingRepository();
const calcom = new CalcomAdapter();

const CancelSchema = z.object({ company_id: z.string().uuid(), reason: z.string().optional() });

export async function PUT(req: NextRequest, { params }: { params: { appointmentId: string } }) {
  try {
    const body = await req.json();
    const parsed = CancelSchema.parse(body);

    await requireCompanyAccess(req, parsed.company_id, "write:appointments");

    const existing = await bookingRepo.getAppointmentById(params.appointmentId);
    if (!existing || existing.company_id !== parsed.company_id) return formatApiResponse(null, 404, "Appointment not found");

    if (existing.calcom_booking_id) {
      await calcom.cancelBooking(existing.calcom_booking_id, parsed.reason);
    }

    const updated = await bookingRepo.cancelAppointment(params.appointmentId, parsed.reason);
    return formatApiResponse(updated, 200, "Appointment cancelled successfully");
  } catch (error) {
    return handleApiError(error);
  }
}
