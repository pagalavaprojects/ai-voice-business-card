import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/shared/lib/supabase";
import { Logger } from "@/shared/lib/logger";
import { getWhatsAppNotifier } from "@/core/infrastructure/notifications/WhatsAppNotifier";
import { ResendEmailAdapter } from "@/core/infrastructure/email/ResendEmailAdapter";
import { isPlaceholderCredential } from "@/shared/lib/security";
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
/** Timeline activity types that prove the contact WAS used — a call, an email
 * exchange, an appointment. Such a lead is engaged, not "unused". */
const USED_ACTIVITY_TYPES = new Set(["CALL", "EMAIL", "APPOINTMENT"]);

type ChannelResult = "sent" | "failed" | "skipped";
type UnusedLeadChannels = { leadWhatsapp: ChannelResult; leadEmail: ChannelResult; ownerWhatsapp: ChannelResult; ownerEmail: ChannelResult };

/** Escapes the four characters that would let a stored name or address break
 * out of the reminder's HTML. */
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string);

/**
 * Daily reminders, run by Vercel Cron (see vercel.json). Two sweeps share one
 * engine — the notifiers, the PK-atomic claim, the timeline marker:
 *
 * 1. The ~24-hour appointment follow-up (WhatsApp): appointments CREATED
 *    24-48h ago whose lead has a phone number.
 * 2. The 2-day UNUSED-CONTACT reminder (req 15): a lead whose contact details
 *    were captured but who never used them — still NEW/QUALIFIED, no
 *    appointment, no call/email/appointment on the timeline — 48h-120h after
 *    capture. The lead gets a gentle re-engagement nudge and the owner a
 *    follow-up prompt, over every configured channel that has an address
 *    (WhatsApp by phone, email by address). Channels are independent and
 *    failure-isolated; the lead is marked once when at least one channel
 *    delivered, and a lead with no channel delivered stays unmarked and is
 *    retried next run while inside the window.
 *
 * - Idempotent: a lead is reminded at most once per sweep, enforced by the
 *   timeline marker + an atomic claim (two overlapping cron deliveries cannot
 *   both send).
 * - Inert without credentials: no configured provider means a pure no-op that
 *   writes no markers and claims no deliveries.
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
  const whatsappOk = whatsapp.isConfigured();
  const emailOk = !isPlaceholderCredential(process.env.RESEND_API_KEY);
  if (!whatsappOk && !emailOk) {
    return NextResponse.json({ processed: 0, skipped: "notifications_unconfigured" });
  }
  const email = emailOk ? new ResendEmailAdapter() : null;

  const now = Date.now();
  let processed = 0;
  let sent = 0;
  let skippedNoPhone = 0;
  let alreadyReminded = 0;

  // ============================================================
  // First sweep: ~24h appointment follow-up (WhatsApp)
  // ============================================================
  if (whatsappOk) {
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
    processed = appointments?.length ?? 0;

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
  }

  // ============================================================
  // Second sweep: contacts captured but UNUSED for ~2 days (req 15)
  // ============================================================
  // "Unused" is the authoritative existing state, not an invented field: the
  // lead is still NEW or QUALIFIED (never CONTACTED / BOOKED / DISQUALIFIED),
  // has no appointment in any status (a cancelled booking still means the
  // contact was used), and has no call / email / appointment on its timeline.
  // Bounded to a 48h-120h window so a stale lead is reminded once, then ages
  // out.
  const leadWindowStart = new Date(now - 120 * 3600_000).toISOString();
  const leadWindowEnd = new Date(now - 48 * 3600_000).toISOString();
  const { data: unusedLeads, error: leadErr } = await supabaseAdmin
    .from("leads")
    .select("id, company_id, employee_id, name, email, phone, status, created_at")
    .in("status", ["NEW", "QUALIFIED"])
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

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/+$/, "");
  const counters = { processed: candidateLeads.length, sent: 0, skippedNoChannel: 0, skippedUsed: 0, alreadyReminded: 0, failed: 0 };
  for (const lead of candidateLeads) {
    if (bookedLeadIds.has(lead.id)) {
      counters.skippedUsed++;
      continue; // engaged, not unused
    }
    try {
      const [employee, timeline] = await Promise.all([knowledgeRepo.getEmployeeById(lead.employee_id), crmRepo.getActivityTimeline(lead.id)]);
      if (timeline.some((a) => USED_ACTIVITY_TYPES.has(a.type))) {
        counters.skippedUsed++;
        continue;
      }
      if (timeline.some((a) => a.content === UNUSED_LEAD_MARKER)) {
        counters.alreadyReminded++;
        continue;
      }
      const leadPhone = whatsappOk && lead.phone ? String(lead.phone) : null;
      const leadEmail = email && lead.email ? String(lead.email) : null;
      const ownerPhone = whatsappOk && employee?.phone ? String(employee.phone) : null;
      const ownerEmail = email && employee?.email ? String(employee.email) : null;
      if (!leadPhone && !leadEmail && !ownerPhone && !ownerEmail) {
        counters.skippedNoChannel++;
        continue;
      }
      const claim = `lead-unused-reminder:${lead.id}`;
      if (!(await acquireClaim(claim).catch(() => false))) {
        counters.alreadyReminded++;
        continue;
      }

      const leadName = lead.name ?? "there";
      const ownerName = employee?.name ?? "our team";
      const cardUrl = appUrl ? `${appUrl}/${lead.company_id}/${lead.employee_id}` : "";
      const leadText = `Hi ${leadName} — a quick follow-up from ${ownerName}. You saved our contact a couple of days ago; whenever you're ready, reply here or pick a time that suits you${cardUrl ? `: ${cardUrl}` : "."}`;
      const ownerText = `Follow-up reminder: the lead ${lead.name ?? "you captured"} (${lead.email ?? "no email"}, ${lead.phone ?? "no phone"}) was captured about 2 days ago and hasn't been contacted or booked yet. A quick WhatsApp/email — or sending them your calendar — could re-engage them.`;

      const channels: UnusedLeadChannels = { leadWhatsapp: "skipped", leadEmail: "skipped", ownerWhatsapp: "skipped", ownerEmail: "skipped" };
      const attempt = async (key: keyof UnusedLeadChannels, run: () => Promise<boolean>) => {
        try {
          channels[key] = (await run()) ? "sent" : "failed";
        } catch (err) {
          channels[key] = "failed";
          Logger.warn("Unused-lead reminder: channel failed", { leadId: lead.id, channel: key, error: err instanceof Error ? err.message : String(err) });
        }
      };
      if (leadPhone) await attempt("leadWhatsapp", async () => (await whatsapp.send(leadPhone, leadText)).sent);
      if (leadEmail && email) {
        await attempt(
          "leadEmail",
          async () =>
            (
              await email.sendEmail({
                to: leadEmail,
                subject: `A quick follow-up from ${ownerName}`,
                html: `<p>Hi ${esc(leadName)},</p><p>A quick follow-up from ${esc(ownerName)} — you saved our contact a couple of days ago. Whenever you're ready, just reply to this email${cardUrl ? ` or pick a time that suits you: <a href="${esc(cardUrl)}">${esc(cardUrl)}</a>` : ""}.</p>`,
                idempotencyKey: `lead-unused-2d:${lead.id}:lead`,
              })
            ).success
        );
      }
      if (ownerPhone) await attempt("ownerWhatsapp", async () => (await whatsapp.send(ownerPhone, ownerText)).sent);
      if (ownerEmail && email) {
        await attempt(
          "ownerEmail",
          async () =>
            (
              await email.sendEmail({
                to: ownerEmail,
                subject: `Follow-up reminder: ${lead.name ?? "a lead"} hasn't been contacted yet`,
                html: `<p>${esc(ownerText)}</p>`,
                idempotencyKey: `lead-unused-2d:${lead.id}:owner`,
              })
            ).success
        );
      }

      if (!Object.values(channels).includes("sent")) {
        // Nothing delivered: retryable next run while still in the window.
        await releaseClaim(claim).catch(() => {});
        counters.failed++;
        continue;
      }
      await crmRepo.addActivity(lead.id, lead.company_id, "NOTE", UNUSED_LEAD_MARKER, undefined, { kind: "unused_lead_2d", channels });
      counters.sent++;
    } catch (err) {
      Logger.warn("Unused-lead reminder: lead skipped on error", {
        leadId: lead.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return NextResponse.json({
    processed,
    sent,
    skippedNoPhone,
    alreadyReminded,
    ...(whatsappOk ? {} : { skipped: "whatsapp_unconfigured" }),
    unusedLeads: counters,
  });
}
