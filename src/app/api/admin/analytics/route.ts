import { NextRequest } from "next/server";
import { formatApiResponse } from "@/shared/lib/security";
import { handleApiError } from "@/shared/lib/apiHandler";
import { requireCompanyDataScope } from "@/shared/lib/tenant";
import { supabaseAdmin } from "@/shared/lib/supabase";
import { buildProviderHealth } from "@/shared/lib/providerHealth";

export const dynamic = "force-dynamic";

/**
 * Analytics computed entirely from this company's own rows.
 *
 * Deliberately NOT reported here, because the data to support them does not
 * exist and a plausible-looking number would be worse than an absent one:
 *
 *   - Lead source — there is no `source` column; every lead arrives through
 *     the voice card, so any breakdown would be invented.
 *   - Most-asked questions — `conversations.intent` exists but is never
 *     populated; deriving it needs transcript analysis that isn't built.
 *   - Prompt-module usage — all six modules take part in every assembly, so
 *     a chart would be six identical bars carrying no information.
 *   - AI latency / response time — never measured per conversation. The OTel
 *     histogram covers HTTP handler duration, which is not the same thing.
 *
 * Each needs instrumentation added on purpose rather than a placeholder.
 */

type Bucket = { key: string; calls: number };

/** Groups ISO timestamps into day/week/month buckets in one pass. */
function bucketByPeriod(timestamps: string[], period: "day" | "week" | "month"): Bucket[] {
  const counts = new Map<string, number>();

  for (const ts of timestamps) {
    const d = new Date(ts);
    if (Number.isNaN(d.getTime())) continue;

    let key: string;
    if (period === "day") {
      key = d.toISOString().slice(0, 10);
    } else if (period === "month") {
      key = d.toISOString().slice(0, 7);
    } else {
      // ISO week starting Monday, keyed by that Monday's date so the bucket
      // label is a real day rather than an opaque week number.
      const monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
      const shift = (monday.getUTCDay() + 6) % 7;
      monday.setUTCDate(monday.getUTCDate() - shift);
      key = monday.toISOString().slice(0, 10);
    }
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return [...counts.entries()].map(([key, calls]) => ({ key, calls })).sort((a, b) => a.key.localeCompare(b.key));
}

/** Fills gaps so a quiet day renders as zero rather than vanishing and making
 * the line imply continuous activity. */
function fillDays(buckets: Bucket[], days: number): Bucket[] {
  const byKey = new Map(buckets.map((b) => [b.key, b.calls]));
  const out: Bucket[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - i);
    const key = d.toISOString().slice(0, 10);
    out.push({ key, calls: byKey.get(key) ?? 0 });
  }
  return out;
}

export async function GET(req: NextRequest) {
  try {
    const companyId = req.nextUrl.searchParams.get("companyId");
    if (!companyId) return formatApiResponse(null, 400, "companyId query parameter is required");

    // Same person-level narrowing as the overview: for staff these charts
    // describe only their own work, never a colleague's.
    const { employeeId } = await requireCompanyDataScope(req, companyId, "read:leads");
    const scopeMatch: Record<string, string> = employeeId
      ? { company_id: companyId, employee_id: employeeId }
      : { company_id: companyId };

    const windowDays = Math.min(Number(req.nextUrl.searchParams.get("days")) || 30, 365);
    const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString();

    const [conversations, leads, appointments, employees, qualCompletedLeads, reminderActivities] = await Promise.all([
      supabaseAdmin
        .from("conversations")
        .select("id, employee_id, created_at, duration_seconds, status, tools_called, audio_metadata, channel, intent")
        .match(scopeMatch)
        .gte("created_at", since)
        .order("created_at", { ascending: true })
        .limit(5000),
      supabaseAdmin
        .from("leads")
        .select("id, employee_id, status, score, score_category, created_at")
        .match(scopeMatch)
        .is("deleted_at", null)
        .gte("created_at", since)
        .limit(5000),
      supabaseAdmin
        .from("appointments")
        .select("id, status, created_at, start_time")
        .match(scopeMatch)
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(5000),
      supabaseAdmin.from("employees").select("id, name, designation").eq("company_id", companyId).is("deleted_at", null),
      // Six-question flow completions: a lead whose qualification_notes
      // records a Q6 answer genuinely finished all six authored questions.
      // Deliberately DISTINCT from the legacy score_category ("qualified
      // leads") — the six-question visitor flow has no HOT/WARM/COLD gate.
      supabaseAdmin
        .from("leads")
        .select("id, name, created_at")
        .match(scopeMatch)
        .is("deleted_at", null)
        .gte("created_at", since)
        .like("qualification_notes", "%Q6 [%")
        .order("created_at", { ascending: false })
        .limit(5000),
      // 24h WhatsApp reminders actually sent — the cron's own idempotency
      // markers on the lead timeline are the audit trail.
      // lead_activities carries no employee_id. Rather than show a staff
      // member the company's reminder count as if it were theirs, the
      // query is skipped for them.
      employeeId
        ? Promise.resolve({ count: 0 })
        : supabaseAdmin
            .from("lead_activities")
            .select("id", { count: "exact", head: true })
            .eq("company_id", companyId)
            .eq("content", "whatsapp_reminder_24h")
            .gte("created_at", since),
    ]);

    const convRows = conversations.data ?? [];
    const leadRows = leads.data ?? [];
    const apptRows = appointments.data ?? [];
    const employeeRows = employees.data ?? [];

    // ---- Headline counts -------------------------------------------------
    const totalConversations = convRows.length;
    const totalLeads = leadRows.length;
    const qualifiedLeads = leadRows.filter((l) => l.score_category === "HIGH" || l.score_category === "MEDIUM").length;

    const durations = convRows.map((c) => Number(c.duration_seconds)).filter((n) => Number.isFinite(n) && n > 0);
    const avgDurationSeconds = durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : null;
    const totalVoiceSeconds = durations.reduce((a, b) => a + b, 0);

    // ---- Call outcomes ---------------------------------------------------
    // endedReason comes from Vapi's end-of-call report. Anything containing
    // "error" or "failed" is a genuine failure; a customer hanging up is a
    // normal ending, not a failure.
    let failedCalls = 0;
    let completedCalls = 0;
    for (const c of convRows) {
      const reason = String((c.audio_metadata as Record<string, unknown> | null)?.endedReason ?? "");
      if (/error|failed|timeout/i.test(reason)) failedCalls++;
      else if (c.status === "SUMMARIZED" || reason) completedCalls++;
    }
    // Only calls that actually reached an outcome can be scored.
    const scorableCalls = failedCalls + completedCalls;
    const successRatePercent = scorableCalls > 0 ? Math.round((completedCalls / scorableCalls) * 1000) / 10 : null;

    // ---- Tool usage — what visitors actually asked the AI to do ----------
    const toolCounts = new Map<string, number>();
    for (const c of convRows) {
      for (const tool of (c.tools_called as string[] | null) ?? []) {
        toolCounts.set(tool, (toolCounts.get(tool) ?? 0) + 1);
      }
    }
    const toolUsage = [...toolCounts.entries()].map(([tool, count]) => ({ tool, count })).sort((a, b) => b.count - a.count);

    // ---- Funnels ---------------------------------------------------------
    const leadStatusOrder = ["NEW", "CONTACTED", "QUALIFIED", "CONVERTED"];
    const leadFunnel = leadStatusOrder.map((stage) => ({ stage, count: leadRows.filter((l) => l.status === stage).length }));

    const apptStatusOrder = ["REQUESTED", "BOOKED", "COMPLETED", "CANCELLED"];
    const appointmentFunnel = apptStatusOrder.map((stage) => ({ stage, count: apptRows.filter((a) => a.status === stage).length }));

    // ---- Per-employee performance ---------------------------------------
    const employeePerformance = employeeRows
      .map((e) => {
        const calls = convRows.filter((c) => c.employee_id === e.id);
        const empLeads = leadRows.filter((l) => l.employee_id === e.id);
        const empDurations = calls.map((c) => Number(c.duration_seconds)).filter((n) => Number.isFinite(n) && n > 0);
        return {
          employeeId: e.id,
          name: e.name,
          designation: e.designation,
          calls: calls.length,
          leads: empLeads.length,
          qualified: empLeads.filter((l) => l.score_category === "HIGH" || l.score_category === "MEDIUM").length,
          avgDurationSeconds: empDurations.length ? Math.round(empDurations.reduce((a, b) => a + b, 0) / empDurations.length) : null,
          conversionPercent: calls.length > 0 ? Math.round((empLeads.length / calls.length) * 1000) / 10 : null,
        };
      })
      .sort((a, b) => b.calls - a.calls);

    const timestamps = convRows.map((c) => String(c.created_at));

    // ---- Six-question qualification + defined conversion -----------------
    const qualRows = qualCompletedLeads.data ?? [];
    const qualificationCompleted = qualRows.length;
    // Started = a voice/WhatsApp conversation actually invoked the
    // sequencing tool (server-authoritative, not inferred from UI events).
    const qualificationStarted = convRows.filter((c) => ((c.tools_called as string[] | null) ?? []).includes("get_next_qualification_question")).length;

    const appointmentsBooked = apptRows.filter((a) => a.status === "BOOKED" || a.status === "COMPLETED").length;
    // The one defined conversion the data genuinely supports: of visitors
    // who finished all six questions, how many ended with a REAL booked
    // appointment. Null (never 0%) without a denominator.
    const definedConversion = {
      definition: "Confirmed appointments ÷ completed six-question qualifications, in the selected window.",
      numerator: appointmentsBooked,
      denominator: qualificationCompleted,
      percent: qualificationCompleted > 0 ? Math.round((appointmentsBooked / qualificationCompleted) * 1000) / 10 : null,
    };

    // ---- Per-day trends beyond call counts -------------------------------
    const minutesByDay = new Map<string, number>();
    for (const c of convRows) {
      const n = Number(c.duration_seconds);
      if (!Number.isFinite(n) || n <= 0) continue;
      const key = String(c.created_at).slice(0, 10);
      minutesByDay.set(key, (minutesByDay.get(key) ?? 0) + n / 60);
    }
    const minutesPerDay = fillDays(
      [...minutesByDay.entries()].map(([key, v]) => ({ key, calls: Math.round(v * 10) / 10 })),
      Math.min(windowDays, 30)
    );
    const qualificationsPerDay = fillDays(bucketByPeriod(qualRows.map((l) => String(l.created_at)), "day"), Math.min(windowDays, 30));
    const bookingsPerDay = fillDays(bucketByPeriod(apptRows.map((a) => String(a.created_at)), "day"), Math.min(windowDays, 30));

    // ---- WhatsApp activity — only what is genuinely recorded -------------
    const whatsappActivity = {
      inboundConversations: convRows.filter((c) => c.channel === "whatsapp").length,
      remindersSent: reminderActivities.count ?? 0,
      note: "Outbound confirmations and summaries are sent fire-and-forget and not individually recorded.",
    };

    // ---- Provider health — the SHARED configuration-truth helper (also
    // used by the live overview endpoint, so the two can never disagree),
    // with the TTS live probe enabled here only: the analytics page is
    // opened deliberately, while the overview polls every few seconds and
    // must never render audio or spend money as a side effect.
    const providerHealth = await buildProviderHealth({
      probeTts: { requestOrigin: req.nextUrl.origin, companyId, employeeId: employeeRows[0]?.id },
    });

    // ---- Recent activity (owner-only; links resolve to existing pages) ---
    const recentActivity = {
      conversations: convRows
        .slice(-5)
        .reverse()
        .map((c) => ({ id: c.id, createdAt: c.created_at, durationSeconds: c.duration_seconds, channel: c.channel ?? "voice", intent: c.intent ?? null })),
      qualifications: qualRows.slice(0, 5).map((l) => ({ id: l.id, name: l.name ?? "Visitor", createdAt: l.created_at })),
      bookings: apptRows.slice(0, 5).map((a) => ({ id: a.id, status: a.status, startTime: a.start_time, createdAt: a.created_at })),
    };

    return formatApiResponse(
      {
        windowDays,
        totalConversations,
        totalLeads,
        qualifiedLeads,
        // Null rather than 0 when there is nothing to divide by — a 0% rate
        // reads as a measured failure rather than an absence of data.
        conversionPercent: totalConversations > 0 ? Math.round((totalLeads / totalConversations) * 1000) / 10 : null,
        avgDurationSeconds,
        totalVoiceMinutes: Math.round(totalVoiceSeconds / 60),
        successRatePercent,
        failedCalls,
        completedCalls,
        callsPerDay: fillDays(bucketByPeriod(timestamps, "day"), Math.min(windowDays, 30)),
        callsPerWeek: bucketByPeriod(timestamps, "week"),
        callsPerMonth: bucketByPeriod(timestamps, "month"),
        leadFunnel,
        appointmentFunnel,
        employeePerformance,
        toolUsage,
        qualificationStarted,
        qualificationCompleted,
        appointmentsBooked,
        definedConversion,
        minutesPerDay,
        qualificationsPerDay,
        bookingsPerDay,
        whatsappActivity,
        providerHealth,
        recentActivity,
        // Named so the UI can state plainly what isn't measured yet, instead
        // of rendering an empty chart that looks like a bug.
        unavailableMetrics: [
          { metric: "Lead source", reason: "No source is recorded — every lead arrives through the voice card." },
          { metric: "Most asked questions", reason: "Requires transcript analysis; intent is derived per call but question text is not aggregated." },
          { metric: "Prompt module usage", reason: "All six modules take part in every assembly, so there is no variation to chart." },
          { metric: "AI response latency", reason: "Not yet measured per conversation." },
          { metric: "Provider cost (Vapi / TTS / WhatsApp)", reason: "Cost data unavailable — provider billing APIs are not integrated; no estimate is invented." },
        ],
      },
      200,
      "Analytics retrieved successfully"
    );
  } catch (error) {
    return handleApiError(error);
  }
}
