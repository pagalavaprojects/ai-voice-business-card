import { NextRequest } from "next/server";
import { formatApiResponse, validateCalcomWebhookSignature } from "@/shared/lib/security";
import { SupabaseBookingRepository } from "@/core/infrastructure/database/supabase/SupabaseBookingRepository";
import { Logger } from "@/shared/lib/logger";
import { supabaseAdmin } from "@/shared/lib/supabase";
import { AppointmentStatus } from "@/core/domain/models/types";

const bookingRepo = new SupabaseBookingRepository();

interface CalcomWebhookPayload {
  triggerEvent: string;
  payload: {
    uid: string;
    startTime?: string;
    endTime?: string;
  };
}

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

    const event = JSON.parse(rawBody) as CalcomWebhookPayload;
    const bookingUid = event.payload?.uid;
    if (!bookingUid) return formatApiResponse(null, 400, "Missing booking uid in payload");

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
    const message = error instanceof Error ? error.message : "Unknown server error";
    Logger.error("Cal.com webhook error", { error: message });
    return formatApiResponse(null, 500, "Internal Server Error", [message]);
  }
}
