import { NextRequest } from "next/server";
import { z } from "zod";
import { formatApiResponse, validateCalcomWebhookSignature } from "@/shared/lib/security";
import { handleApiError } from "@/shared/lib/apiHandler";
import { SupabaseBookingRepository } from "@/core/infrastructure/database/supabase/SupabaseBookingRepository";
import { Logger } from "@/shared/lib/logger";
import { supabaseAdmin } from "@/shared/lib/supabase";
import { AppointmentStatus } from "@/core/domain/models/types";

// Reads the session cookie and/or query params, so it can never be rendered
// statically. Declared explicitly to stop Next attempting a static pass that
// always throws "Dynamic server usage" — noise that buried real errors in the
// build log.
export const dynamic = "force-dynamic";


const bookingRepo = new SupabaseBookingRepository();

// A valid HMAC signature only proves the body wasn't tampered with in
// transit — it says nothing about its shape. Cal.com's own API can (and
// has) changed field shapes across versions, so this still validates
// structure before any field reaches business logic, the same as every
// other webhook/tool-call boundary in this codebase (see
// LeadQualificationSignalsSchema, BookRequestSchema).
const CalcomWebhookPayloadSchema = z.object({
  triggerEvent: z.string().min(1),
  payload: z.object({
    uid: z.string().min(1),
    startTime: z.string().optional(),
    endTime: z.string().optional(),
  }),
});

/** Cal.com webhook synchronization: keeps our `appointments` row in sync
 * with booking-status changes made directly in Cal.com (e.g. the visitor
 * reschedules via the Cal.com confirmation email, or an admin cancels
 * from the Cal.com dashboard) rather than only through this app. */
export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const signature = req.headers.get("x-cal-signature-256");

    if (!validateCalcomWebhookSignature(rawBody, signature)) {
      return formatApiResponse(null, 401, "Unauthorized: invalid webhook signature", ["Invalid signature"]);
    }

    const event = CalcomWebhookPayloadSchema.parse(JSON.parse(rawBody));
    const bookingUid = event.payload.uid;

    const { data: appointment } = await supabaseAdmin.from("appointments").select().eq("calcom_booking_id", bookingUid).maybeSingle();
    if (!appointment) {
      Logger.info("Cal.com webhook for unknown booking", { bookingUid, triggerEvent: event.triggerEvent });
      return formatApiResponse({ status: "ignored" }, 200, "No matching appointment found for this booking");
    }

    switch (event.triggerEvent) {
      case "BOOKING_CANCELLED":
        await bookingRepo.cancelAppointment(appointment.id, "Cancelled via Cal.com");
        break;
      case "BOOKING_RESCHEDULED":
        if (event.payload.startTime && event.payload.endTime) {
          await bookingRepo.rescheduleAppointment(appointment.id, event.payload.startTime, event.payload.endTime);
        }
        break;
      case "MEETING_ENDED":
        await bookingRepo.updateAppointmentStatus(appointment.id, AppointmentStatus.COMPLETED);
        break;
      default:
        Logger.info("Unhandled Cal.com webhook event", { triggerEvent: event.triggerEvent });
    }

    return formatApiResponse({ status: "processed" }, 200, "Webhook processed successfully");
  } catch (error: unknown) {
    return handleApiError(error);
  }
}
