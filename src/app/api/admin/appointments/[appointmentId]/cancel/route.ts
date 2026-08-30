import { NextRequest } from "next/server";
import { z } from "zod";
import { formatApiResponse } from "@/shared/lib/security";
import { handleApiError } from "@/shared/lib/apiHandler";
import { requireCompanyDataScope } from "@/shared/lib/tenant";
import { SupabaseBookingRepository } from "@/core/infrastructure/database/supabase/SupabaseBookingRepository";
import { AppointmentStatus } from "@/core/domain/models/types";
import { SupabaseCRMRepository } from "@/core/infrastructure/database/supabase/SupabaseCRMRepository";
import { CalcomAdapter } from "@/core/infrastructure/booking/calcom/CalcomAdapter";
import { NotificationService } from "@/core/application/services/NotificationService";
import { ResendEmailAdapter } from "@/core/infrastructure/email/ResendEmailAdapter";
import { SupabaseEmailLogRepository } from "@/core/infrastructure/database/supabase/SupabaseEmailLogRepository";
import { Logger } from "@/shared/lib/logger";

// Reads the session cookie and/or query params, so it can never be rendered
// statically. Declared explicitly to stop Next attempting a static pass that
// always throws "Dynamic server usage" — noise that buried real errors in the
// build log.
export const dynamic = "force-dynamic";


const bookingRepo = new SupabaseBookingRepository();
const crmRepo = new SupabaseCRMRepository();
const calcom = new CalcomAdapter();
const notificationService = new NotificationService(new ResendEmailAdapter(), new SupabaseEmailLogRepository());

const CancelSchema = z.object({ company_id: z.string().uuid(), reason: z.string().optional() });

export async function PUT(req: NextRequest, { params }: { params: { appointmentId: string } }) {
  try {
    const body = await req.json();
    const parsed = CancelSchema.parse(body);

    // Staff may only act on appointments attributed to them — cancelling
    // or rescheduling a colleague's booking is the same exposure as reading
    // it, with a side effect attached.
    const { employeeId } = await requireCompanyDataScope(req, parsed.company_id, "write:appointments");

    const existing = await bookingRepo.getAppointmentById(params.appointmentId);
    if (!existing || existing.company_id !== parsed.company_id || (employeeId && existing.employee_id !== employeeId)) {
      // Same 404 as a missing row: the refusal must not confirm it exists.
      return formatApiResponse(null, 404, "Appointment not found");
    }

    // Cancelling an already-cancelled appointment is a no-op: re-running the
    // Cal.com cancellation and re-emailing the visitor would be duplicate
    // side effects (a second "your meeting has been cancelled" email, a
    // second Cal.com call that may itself error) for a state change that has
    // already happened. Return the existing row idempotently.
    if (existing.status === AppointmentStatus.CANCELLED) {
      return formatApiResponse(existing, 200, "Appointment already cancelled");
    }

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
