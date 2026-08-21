/**
 * Pure aggregation helpers for the live dashboard overview — factored out of
 * the API route so every number the owner sees has a directly unit-testable
 * calculation behind it. No Supabase, no fetch, no Date.now() here: rows in,
 * numbers out.
 */

export interface QualificationFunnel {
  q1: number;
  q2: number;
  q3: number;
  q4: number;
  q5: number;
  q6: number;
  completed: number;
}

/**
 * Counts how many leads reached each authored question, from the ONLY
 * authoritative record: the `Qn [YES|NO|MAYBE]` lines the sequencing tool
 * appends to qualification_notes. "Reached Qn" = an answer line for Qn
 * exists. "Completed" = Q6 answered. A lead with no answer lines
 * contributes to nothing — started-but-silent shows up in conversation
 * counts, never as invented funnel progress.
 */
export function computeQualificationFunnel(rows: Array<{ qualification_notes: string | null }>): QualificationFunnel {
  const funnel = { q1: 0, q2: 0, q3: 0, q4: 0, q5: 0, q6: 0, completed: 0 };
  for (const row of rows) {
    const notes = row.qualification_notes ?? "";
    for (let n = 1; n <= 6; n++) {
      if (new RegExp(`(^|\\n)Q${n} \\[(YES|NO|MAYBE)\\]`).test(notes)) {
        funnel[`q${n}` as "q1"]++;
      }
    }
  }
  funnel.completed = funnel.q6;
  return funnel;
}

/** Booked ÷ completed qualifications. Null (never 0%) without a denominator —
 * the UI shows the definition alongside the number. */
export function bookingConversionPercent(booked: number, completedQualifications: number): number | null {
  if (completedQualifications <= 0) return null;
  return Math.round((booked / completedQualifications) * 1000) / 10;
}

/** The owner-selectable windows for the single-page control centre. "today"
 * is the OWNER's local midnight, which only their browser knows — the route
 * receives it as a bounded timestamp, exactly as it already does for the
 * today-tiles. */
export type DashboardRange = "today" | "7d" | "30d" | "90d";

export const DASHBOARD_RANGES: readonly DashboardRange[] = ["today", "7d", "30d", "90d"] as const;

export function isDashboardRange(value: string | null | undefined): value is DashboardRange {
  return (DASHBOARD_RANGES as readonly string[]).includes(value ?? "");
}

export interface RangeWindow {
  range: DashboardRange;
  sinceIso: string;
  /** Whole days the window spans — the number of buckets a trend chart draws.
   * "today" is one bucket by definition. */
  days: number;
  label: string;
}

/** Resolves a range to an absolute window. `todayStartIso` is the owner's own
 * local midnight; when it is missing or implausible the caller's UTC midnight
 * is used, matching the existing today-tile rule. */
export function resolveRangeWindow(range: DashboardRange, nowMs: number, todayStartIso?: string | null): RangeWindow {
  if (range === "today") {
    const parsed = todayStartIso ? Date.parse(todayStartIso) : NaN;
    const usable = Number.isFinite(parsed) && nowMs - parsed < 48 * 3600_000 && parsed <= nowMs;
    const since = usable ? new Date(parsed) : new Date(new Date(nowMs).setUTCHours(0, 0, 0, 0));
    return { range, sinceIso: since.toISOString(), days: 1, label: "Today" };
  }
  const days = range === "7d" ? 7 : range === "30d" ? 30 : 90;
  // Anchored to whole UTC days ENDING TODAY, not to "now minus N×24h".
  // A rolling-instant window starts mid-day, so its final day-bucket lands
  // on YESTERDAY and every call made today falls outside the chart — caught
  // against real data, where 4 of 501 conversations silently vanished from
  // the trend. Flooring to midnight makes the query window and the buckets
  // describe exactly the same N calendar days, today included.
  const todayMidnight = new Date(nowMs).setUTCHours(0, 0, 0, 0);
  return {
    range,
    sinceIso: new Date(todayMidnight - (days - 1) * 24 * 3600_000).toISOString(),
    days,
    label: `Last ${days} days`,
  };
}

/**
 * Conversation counts per persisted language code.
 *
 * `language` is nullable on older rows (it predates multilingual support), so
 * those are reported as `unspecified` rather than being silently folded into
 * English — inventing a language for 100 legacy rows would misstate the
 * Tamil/English split the owner is actually trying to read.
 */
export function computeLanguageSplit(rows: Array<{ language?: string | null }>): Record<string, number> {
  const split: Record<string, number> = {};
  for (const row of rows) {
    const key = row.language?.trim() || "unspecified";
    split[key] = (split[key] ?? 0) + 1;
  }
  return split;
}

export interface DailyPoint {
  /** YYYY-MM-DD in UTC — the bucket key the trend chart plots. */
  key: string;
  calls: number;
  minutes: number;
}

/**
 * Daily call/minute buckets across the window, INCLUDING days with no
 * activity: a trend line that silently omits empty days implies continuous
 * usage that never happened. Minutes are rounded once at the end so a day of
 * many short calls cannot accumulate rounding drift.
 */
export function computeDailySeries(
  rows: Array<{ started_at: string; duration_seconds?: number | null }>,
  window: RangeWindow,
  nowMs: number
): DailyPoint[] {
  const buckets = new Map<string, { calls: number; seconds: number }>();
  const sinceMs = Date.parse(window.sinceIso);

  // A single-day window is the OWNER's local day, which generally is not a
  // UTC day: for an IST owner it begins 18:30Z the previous date. Bucketing
  // those rows by their UTC date therefore both mislabels the bar and drops
  // the rows — observed live as "4 conversations" beside a bar reading 0 on
  // yesterday's date. Every row the query returned is by definition inside
  // this one day, so they all belong to one bucket, labelled with the
  // owner's own date (taken at local midday, which lands on the correct
  // date for every real UTC offset).
  if (window.days === 1) {
    const ownerDate = new Date(sinceMs + 12 * 3600_000).toISOString().slice(0, 10);
    const seconds = rows.reduce((sum, r) => sum + (Number(r.duration_seconds) || 0), 0);
    return [{ key: ownerDate, calls: rows.length, minutes: Math.round((seconds / 60) * 10) / 10 }];
  }
  for (let i = 0; i < window.days; i++) {
    const day = new Date(sinceMs + i * 24 * 3600_000);
    if (day.getTime() > nowMs + 24 * 3600_000) break;
    buckets.set(day.toISOString().slice(0, 10), { calls: 0, seconds: 0 });
  }
  for (const row of rows) {
    const key = row.started_at.slice(0, 10);
    const bucket = buckets.get(key);
    if (!bucket) continue; // outside the requested window
    bucket.calls++;
    bucket.seconds += Number(row.duration_seconds) || 0;
  }
  return [...buckets.entries()].map(([key, v]) => ({
    key,
    calls: v.calls,
    minutes: Math.round((v.seconds / 60) * 10) / 10,
  }));
}

export interface WhatsAppBreakdown {
  /** Inbound qualification conversations that arrived over WhatsApp. */
  qualificationConversations: number;
  appointmentConfirmations: { sent: number; failed: number };
  ownerSummaries: { sent: number; failed: number };
  reminders: { sent: number };
}

/**
 * Splits WhatsApp activity into the four DISTINCT things it can be, instead
 * of one ambiguous total. Every number comes from a persisted record:
 * booking notification audits (`appointment_notifications` outcomes), the
 * per-conversation owner-summary stamps, the reminder timeline marker, and
 * the conversations table's own channel column.
 *
 * "Sent" here means the provider ACCEPTED the message — the only thing the
 * audit can honestly attest. Delivery to a handset is not observable from
 * this data and is never claimed.
 */
export function computeWhatsAppBreakdown(
  conversations: Array<{ channel?: string | null; audio_metadata?: { summaryNotification?: { sent: boolean } } | null }>,
  activities: ActivityRow[]
): WhatsAppBreakdown {
  const out: WhatsAppBreakdown = {
    qualificationConversations: 0,
    appointmentConfirmations: { sent: 0, failed: 0 },
    ownerSummaries: { sent: 0, failed: 0 },
    reminders: { sent: 0 },
  };

  for (const c of conversations) {
    if (c.channel === "whatsapp") out.qualificationConversations++;
    const stamp = c.audio_metadata?.summaryNotification;
    if (stamp) {
      if (stamp.sent) out.ownerSummaries.sent++;
      else out.ownerSummaries.failed++;
    }
  }

  for (const act of activities) {
    if (act.content === "whatsapp_reminder_24h") {
      out.reminders.sent++;
      continue;
    }
    if (act.content !== "appointment_notifications") continue;
    const outcomes = (act.metadata?.outcomes ?? {}) as Record<string, string>;
    for (const [channel, result] of Object.entries(outcomes)) {
      if (!channel.endsWith(":whatsapp")) continue;
      if (result.startsWith("failed")) out.appointmentConfirmations.failed++;
      else out.appointmentConfirmations.sent++;
    }
  }

  return out;
}

export interface EmailBreakdown {
  /** Provider ACCEPTED the message. Not a delivery receipt — the provider
   * gives us no delivery callback, so the UI must not imply one. */
  providerAccepted: number;
  failed: number;
  /** Historical rows written while the adapter simulated sends (provider ids
   * shaped `sim_msg_*`). Counted apart so an owner is never shown a
   * simulated send as a real one — the exact defect the fail-closed adapter
   * change fixed. */
  simulated: number;
  clientConfirmations: number;
  adminConfirmations: number;
}

export function computeEmailBreakdown(
  rows: Array<{ status?: string | null; provider_message_id?: string | null; template_name?: string | null }>
): EmailBreakdown {
  const out: EmailBreakdown = { providerAccepted: 0, failed: 0, simulated: 0, clientConfirmations: 0, adminConfirmations: 0 };
  for (const row of rows) {
    const simulated = (row.provider_message_id ?? "").startsWith("sim_msg_");
    if (simulated) out.simulated++;
    else if (row.status === "SENT") out.providerAccepted++;
    if (row.status === "FAILED") out.failed++;

    const template = row.template_name ?? "";
    if (/client/i.test(template)) out.clientConfirmations++;
    else if (/owner|admin/i.test(template)) out.adminConfirmations++;
  }
  return out;
}

export interface Blocker {
  id: string;
  problem: string;
  status: string;
  action: string;
  severity: "blocked" | "degraded";
}

/**
 * Turns provider state into the owner-facing blocker list — ONLY where real
 * evidence supports it. A provider that is simply unconfigured and unused
 * raises nothing; a provider whose recorded outcomes show failures does.
 * Never includes provider identifiers, endpoints or credential details.
 */
export function deriveBlockers(
  health: Record<string, string>,
  whatsapp: WhatsAppBreakdown,
  email: EmailBreakdown
): Blocker[] {
  const blockers: Blocker[] = [];

  const whatsappFailures = whatsapp.appointmentConfirmations.failed + whatsapp.ownerSummaries.failed;
  if (whatsappFailures > 0 || health.whatsapp === "not configured") {
    blockers.push({
      id: "whatsapp",
      problem: "WhatsApp messages are not reaching recipients",
      status:
        whatsappFailures > 0
          ? `${whatsappFailures} recorded send${whatsappFailures === 1 ? "" : "s"} failed`
          : "Provider not configured",
      action: "Refresh the WhatsApp access token, then redeploy.",
      severity: "blocked",
    });
  }

  if (health.whatsappTemplate === "not configured") {
    blockers.push({
      id: "whatsapp-template",
      problem: "No approved WhatsApp template is configured",
      status: "Sends are limited to the 24-hour customer-service window",
      action: "Set the approved template name in the deployment environment.",
      severity: "degraded",
    });
  }

  if (email.failed > 0 || health.email === "not configured") {
    blockers.push({
      id: "email",
      problem: "Outbound email is unavailable",
      status: email.failed > 0 ? `${email.failed} send${email.failed === 1 ? "" : "s"} recorded as failed` : "Provider not configured",
      action: "Add a valid email provider key to the deployment environment.",
      severity: "blocked",
    });
  }

  if (email.simulated > 0) {
    blockers.push({
      id: "email-simulated",
      problem: "Some historical emails were simulated, not delivered",
      status: `${email.simulated} historical record${email.simulated === 1 ? "" : "s"} came from a simulated provider`,
      action: "Treat those as not delivered; current sends fail closed instead of simulating.",
      severity: "degraded",
    });
  }

  if (health.tts?.startsWith("unavailable")) {
    blockers.push({
      id: "tts",
      problem: "Speech generation is unavailable for pre-recorded audio",
      status: health.tts,
      action: "Restore credit/billing on the speech provider account.",
      severity: "blocked",
    });
  }

  if (health.calendar === "not configured") {
    blockers.push({
      id: "calendar",
      problem: "Calendar booking is not configured",
      status: "Visitors cannot book a real meeting time",
      action: "Connect the calendar integration in the deployment environment.",
      severity: "blocked",
    });
  }

  if (health.database !== "ok") {
    blockers.push({
      id: "database",
      problem: "The database is not responding normally",
      status: health.database ?? "unknown",
      action: "Check the database provider's status before investigating the application.",
      severity: "blocked",
    });
  }

  return blockers;
}

export type ActivityEvent = {
  at: string;
  type:
    | "conversation"
    | "appointment_booked"
    | "appointment_requested"
    | "appointment_cancelled"
    | "notification"
    | "reminder"
    | "summary_notification";
  label: string;
  status: "ok" | "warn" | "fail";
  detail?: string;
};

interface ConversationRow {
  started_at: string;
  status: string;
  duration_seconds: number | null;
  channel?: string | null;
  intent?: string | null;
  audio_metadata?: { summaryNotification?: { sent: boolean; reason?: string | null } } | null;
}

interface AppointmentRow {
  created_at: string;
  status: string;
  start_time: string;
}

interface ActivityRow {
  created_at: string;
  content: string | null;
  metadata?: Record<string, unknown> | null;
}

/**
 * Merges the three real event sources (conversations, appointments, and the
 * lead-timeline notification/reminder records) into one newest-first feed.
 * Every row here IS a persisted database record — nothing synthesized.
 */
export function mergeActivityFeed(
  conversations: ConversationRow[],
  appointments: AppointmentRow[],
  activities: ActivityRow[],
  limit = 15
): ActivityEvent[] {
  const events: ActivityEvent[] = [];

  for (const c of conversations) {
    const mins = c.duration_seconds ? `${Math.round(c.duration_seconds / 60)}m ${Math.round(c.duration_seconds % 60)}s` : null;
    events.push({
      at: c.started_at,
      type: "conversation",
      label: `AI conversation (${c.channel === "whatsapp" ? "WhatsApp" : "voice"})${c.intent ? ` — ${c.intent}` : ""}`,
      status: c.status === "FAILED" ? "fail" : "ok",
      detail: mins ?? undefined,
    });
    const stamp = c.audio_metadata?.summaryNotification;
    if (stamp) {
      events.push({
        at: c.started_at,
        type: "summary_notification",
        label: stamp.sent ? "Owner summary sent" : `Owner summary not sent (${stamp.reason ?? "unknown"})`,
        status: stamp.sent ? "ok" : "warn",
      });
    }
  }

  for (const a of appointments) {
    events.push({
      at: a.created_at,
      type: a.status === "BOOKED" || a.status === "COMPLETED" ? "appointment_booked" : a.status === "CANCELLED" ? "appointment_cancelled" : "appointment_requested",
      label:
        a.status === "BOOKED" || a.status === "COMPLETED"
          ? "Appointment confirmed"
          : a.status === "CANCELLED"
            ? "Appointment cancelled"
            : "Appointment requested (not on calendar)",
      status: a.status === "BOOKED" || a.status === "COMPLETED" ? "ok" : a.status === "CANCELLED" ? "fail" : "warn",
      detail: new Date(a.start_time).toISOString(),
    });
  }

  for (const act of activities) {
    if (act.content === "whatsapp_reminder_24h") {
      events.push({ at: act.created_at, type: "reminder", label: "24h WhatsApp reminder sent", status: "ok" });
    } else if (act.content === "appointment_notifications") {
      const outcomes = (act.metadata?.outcomes ?? {}) as Record<string, string>;
      const entries = Object.entries(outcomes);
      const failed = entries.filter(([, v]) => v.startsWith("failed"));
      events.push({
        at: act.created_at,
        type: "notification",
        label:
          entries.length === 0
            ? "Booking notifications attempted"
            : failed.length === 0
              ? `Booking notifications sent (${entries.length} channel${entries.length === 1 ? "" : "s"})`
              : `Booking notifications: ${entries.length - failed.length} sent, ${failed.length} failed`,
        status: failed.length === 0 ? "ok" : failed.length === entries.length ? "fail" : "warn",
        detail: failed.map(([k, v]) => `${k}: ${v.replace(/^failed:/, "")}`).join(", ") || undefined,
      });
    }
  }

  return events.sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit);
}
