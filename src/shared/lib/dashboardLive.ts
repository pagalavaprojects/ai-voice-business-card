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
