import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/shared/lib/supabase";
import { Logger } from "@/shared/lib/logger";
import { getWhatsAppNotifier } from "@/core/infrastructure/notifications/WhatsAppNotifier";
import { SupabaseCRMRepository } from "@/core/infrastructure/database/supabase/SupabaseCRMRepository";
import { SupabaseKnowledgeRepository } from "@/core/infrastructure/database/supabase/SupabaseKnowledgeRepository";
import { acquireClaim, releaseClaim } from "@/core/infrastructure/concurrency/ProcessingLock";

export const dynamic = "force-dynamic";

const crmRepo = new SupabaseCRMRepository();
const knowledgeRepo = new SupabaseKnowledgeRepository();

/** Idempotency marker recorded on the lead's activity timeline after a
 * successful send. Uses the existing NOTE activity type + a distinctive
 * content string rather than a new activity enum value or table — the
 * timeline already persists per-lead events durably, and this cannot
 * violate any existing DB constraint on the type column. */
const REMINDER_MARKER = "whatsapp_reminder_24h";
/** Idempotency marker for the DISTINCT 2-day unused-lead reminder (req 15) —
 * separate from the appointment reminder above, on the same timeline. */
const UNUSED_LEAD_MARKER = "lead_unused_reminder_2d";

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

      // Atomically claim this reminder BEFORE sending. The marker check above
      // is a read-then-write race: two overlapping cron runs (Vercel's
      // at-least-once delivery, or a manual re-trigger) can both pass it and
      // both send. The PK-atomic claim lets only one proceed. It also covers
      // the secondary hazard — a marker write that fails AFTER a successful
      // send — because the claim itself persists on success. Crucially it is
      // RELEASED on a failed send, so mark-on-success / retry-on-failure is
      // preserved. Fail-closed (skip) on a claim-store error: safe, retried.
      const reminderClaim = `reminder:${appt.id}`;
      if (!(await acquireClaim(reminderClaim).catch(() => false))) {
        alreadyReminded++;
        continue;
      }

      const when = new Date(appt.start_time).toLocaleString("en-US", { dateStyle: "full", timeStyle: "short", timeZone: "UTC" });
      const clientResult = await whatsapp.send(
        lead.phone,
        `Hi ${lead.name ?? "there"} — a quick follow-up on your meeting with ${employee?.name ?? "our team"} (${when} UTC). Reply here if you'd like to reschedule or have any questions.`
      );
      if (!clientResult.sent) {
        // Failed send stays retryable: release the claim so a later run can
        // try again while still in the window.
        await releaseClaim(reminderClaim).catch(() => {});
        continue;
      }

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

  // ============================================================
  // Second sweep: leads captured but UNUSED for ~2 days (req 15)
  // ============================================================
  // DISTINCT from the appointment follow-up above: a lead whose contact was
  // captured but never advanced (still NEW) and never booked, ~2+ days old,
  // nudges the OWNER to follow up before it goes cold. It reuses the SAME
  // engine — notifier, PK-atomic claim, timeline marker — never a second
  // reminder system. "Unused" uses the authoritative existing state (status
  // still NEW + no appointment), not an invented field. Bounded to a 48h–120h
  // window so a genuinely stale lead is reminded once, then ages out.
  const leadWindowStart = new Date(now - 120 * 3600_000).toISOString();
  const leadWindowEnd = new Date(now - 48 * 3600_000).toISOString();
  const { data: unusedLeads, error: leadErr } = await supabaseAdmin
    .from("leads")
    .select("id, company_id, employee_id, name, email, phone, status, created_at")
    .eq("status", "NEW")
    .gte("created_at", leadWindowStart)
    .lte("created_at", leadWindowEnd)
    .limit(50);
  if (leadErr) Logger.warn("Unused-lead reminder: lead query failed", { error: leadErr.message });

  const candidateLeads = unusedLeads ?? [];
  // A lead that actually has an appointment is NOT "unused" — exclude it.
  const bookedLeadIds = new Set<string>();
  if (candidateLeads.length > 0) {
    const { data: apptRows } = await supabaseAdmin
      .from("appointments")
      .select("lead_id")
      .in(
        "lead_id",
        candidateLeads.map((l) => l.id)
      );
    for (const a of apptRows ?? []) if (a.lead_id) bookedLeadIds.add(a.lead_id as string);
  }

  let leadRemindersSent = 0;
  let leadSkippedNoOwner = 0;
  let leadAlreadyReminded = 0;
  for (const lead of candidateLeads) {
    if (bookedLeadIds.has(lead.id)) continue; // engaged, not unused
    try {
      const [employee, timeline] = await Promise.all([
        knowledgeRepo.getEmployeeById(lead.employee_id),
        crmRepo.getActivityTimeline(lead.id),
      ]);
      // The reminder goes to the OWNER (the one who captured the lead and
      // hasn't acted) — no owner phone means nowhere to send it.
      if (!employee?.phone) {
        leadSkippedNoOwner++;
        continue;
      }
      if (timeline.some((a) => a.content === UNUSED_LEAD_MARKER)) {
        leadAlreadyReminded++;
        continue;
      }
      const claim = `lead-unused-reminder:${lead.id}`;
      if (!(await acquireClaim(claim).catch(() => false))) {
        leadAlreadyReminded++;
        continue;
      }
      const ownerResult = await whatsapp.send(
        employee.phone,
        `Follow-up reminder: the lead ${lead.name ?? "you captured"} (${lead.email}, ${lead.phone}) was captured about 2 days ago and hasn't been contacted or booked yet. A quick WhatsApp/email — or sending them your calendar — could re-engage them.`
      );
      if (!ownerResult.sent) {
        // Retryable next run.
        await releaseClaim(claim).catch(() => {});
        continue;
      }
      await crmRepo.addActivity(lead.id, lead.company_id, "NOTE", UNUSED_LEAD_MARKER, undefined, { channel: "whatsapp", kind: "unused_lead_2d" });
      leadRemindersSent++;
    } catch (err) {
      Logger.warn("Unused-lead reminder: lead skipped on error", {
        leadId: lead.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return NextResponse.json({
    processed: appointments?.length ?? 0,
    sent,
    skippedNoPhone,
    alreadyReminded,
    unusedLeads: { processed: candidateLeads.length, sent: leadRemindersSent, skippedNoOwner: leadSkippedNoOwner, alreadyReminded: leadAlreadyReminded },
  });
}
