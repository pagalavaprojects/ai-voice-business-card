import { NextRequest } from "next/server";
import { z } from "zod";
import { formatApiResponse } from "@/shared/lib/security";
import { handleApiError } from "@/shared/lib/apiHandler";
import { requireCompanyAccess } from "@/shared/lib/tenant";
import { SupabaseBookingRepository } from "@/core/infrastructure/database/supabase/SupabaseBookingRepository";
import { SupabaseCRMRepository } from "@/core/infrastructure/database/supabase/SupabaseCRMRepository";
import { CalcomAdapter } from "@/core/infrastructure/booking/calcom/CalcomAdapter";
import { NotificationService } from "@/core/application/services/NotificationService";
import { ResendEmailAdapter } from "@/core/infrastructure/email/ResendEmailAdapter";
import { SupabaseEmailLogRepository } from "@/core/infrastructure/database/supabase/SupabaseEmailLogRepository";
import { Logger } from "@/shared/lib/logger";

const bookingRepo = new SupabaseBookingRepository();
const crmRepo = new SupabaseCRMRepository();
const calcom = new CalcomAdapter();
const notificationService = new NotificationService(new ResendEmailAdapter(), new SupabaseEmailLogRepository());

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

    const lead = await crmRepo.getLeadById(existing.lead_id);
    if (lead) {
      notificationService
        .send({
          companyId: parsed.company_id,
          to: lead.email,
          subject: "Your meeting has been cancelled",
          templateName: "appointment_cancellation",
          html: `<p>Hi ${lead.name},</p><p>Your meeting scheduled for ${new Date(existing.start_time).toLocaleString()} has been cancelled.${
            parsed.reason ? ` Reason: ${parsed.reason}` : ""
          }</p>`,
        })
        .catch((err) => Logger.error("Cancellation email failed", { error: err instanceof Error ? err.message : String(err) }));
    }

    return formatApiResponse(updated, 200, "Appointment cancelled successfully");
  } catch (error) {
    return handleApiError(error);
  }
}
