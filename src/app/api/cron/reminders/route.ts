import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/shared/lib/supabase";
import { Logger } from "@/shared/lib/logger";
import { getWhatsAppNotifier } from "@/core/infrastructure/notifications/WhatsAppNotifier";
import { SupabaseCRMRepository } from "@/core/infrastructure/database/supabase/SupabaseCRMRepository";
import { SupabaseKnowledgeRepository } from "@/core/infrastructure/database/supabase/SupabaseKnowledgeRepository";

export const dynamic = "force-dynamic";

const crmRepo = new SupabaseCRMRepository();
const knowledgeRepo = new SupabaseKnowledgeRepository();

/** Idempotency marker recorded on the lead's activity timeline after a
 * successful send. Uses the existing NOTE activity type + a distinctive
 * content string rather than a new activity enum value or table — the
 * timeline already persists per-lead events durably, and this cannot
 * violate any existing DB constraint on the type column. */
const REMINDER_MARKER = "whatsapp_reminder_24h";

/**
 * The ~24-hour WhatsApp follow-up, run once daily by Vercel Cron (see
 * vercel.json). Deliberately the smallest production-safe design:
 *
 * - Eligible: appointments CREATED 24-48h ago whose lead has a phone
 *   number (captured by the booking form / voice flow — anonymous vCard
 *   downloads capture no phone, so they are correctly never eligible).
 * - Idempotent: a lead is reminded at most once, enforced by the timeline
 *   marker; an appointment whose send fails simply stays unmarked and is
 *   retried on the next daily run while it remains inside the window.
 * - Inert without credentials: when WhatsApp is unconfigured this is a
 *   pure no-op that writes no markers and claims no deliveries.
 * - Never user-facing: runs only from cron, so nothing here can block or
 *   slow a visitor request.
 *
 * Auth: Vercel Cron sends `Authorization: Bearer ${CRON_SECRET}` when the
 * env var exists. Fails closed if the secret is unset.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ message: "CRON_SECRET not configured" }, { status: 503 });
  }
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const whatsapp = getWhatsAppNotifier();
  if (!whatsapp.isConfigured()) {
    return NextResponse.json({ processed: 0, skipped: "whatsapp_unconfigured" });
  }

  const now = Date.now();
  const windowStart = new Date(now - 48 * 3600_000).toISOString();
  const windowEnd = new Date(now - 24 * 3600_000).toISOString();

  const { data: appointments, error } = await supabaseAdmin
    .from("appointments")
    .select("id, company_id, employee_id, lead_id, start_time, status, created_at")
    .gte("created_at", windowStart)
    .lte("created_at", windowEnd)
    .in("status", ["BOOKED", "REQUESTED"])
    .limit(50);

  if (error) {
    Logger.error("Reminder cron: appointment query failed", { error: error.message });
    return NextResponse.json({ message: "query failed" }, { status: 500 });
  }

  let sent = 0;
  let skippedNoPhone = 0;
  let alreadyReminded = 0;

  for (const appt of appointments ?? []) {
    if (!appt.lead_id) continue;
    try {
      const [lead, employee, timeline] = await Promise.all([
        crmRepo.getLeadById(appt.lead_id),
        knowledgeRepo.getEmployeeById(appt.employee_id),
        crmRepo.getActivityTimeline(appt.lead_id),
      ]);
      if (!lead?.phone) {
        skippedNoPhone++;
        continue;
      }
      if (timeline.some((a) => a.content === REMINDER_MARKER)) {
        alreadyReminded++;
        continue;
      }

      const when = new Date(appt.start_time).toLocaleString("en-US", { dateStyle: "full", timeStyle: "short", timeZone: "UTC" });
      const clientResult = await whatsapp.send(
        lead.phone,
        `Hi ${lead.name ?? "there"} — a quick follow-up on your meeting with ${employee?.name ?? "our team"} (${when} UTC). Reply here if you'd like to reschedule or have any questions.`
      );
      if (!clientResult.sent) continue; // unmarked -> retried tomorrow while in window

      if (employee?.phone) {
        // Owner copy is best-effort; the client send is what gates the marker.
        whatsapp
          .send(employee.phone, `Reminder sent to ${lead.name ?? "lead"} (${lead.phone}) for the ${when} UTC meeting.`)
          .catch(() => undefined);
      }

      await crmRepo.addActivity(appt.lead_id, appt.company_id, "NOTE", REMINDER_MARKER, undefined, {
        appointment_id: appt.id,
        channel: "whatsapp",
      });
      sent++;
    } catch (err) {
      Logger.warn("Reminder cron: appointment skipped on error", {
        appointmentId: appt.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return NextResponse.json({ processed: appointments?.length ?? 0, sent, skippedNoPhone, alreadyReminded });
}
