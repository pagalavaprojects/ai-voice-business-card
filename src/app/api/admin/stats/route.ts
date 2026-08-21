import { NextRequest } from "next/server";
import { formatApiResponse } from "@/shared/lib/security";
import { handleApiError } from "@/shared/lib/apiHandler";
import { requireCompanyAccess } from "@/shared/lib/tenant";
import { supabaseAdmin } from "@/shared/lib/supabase";
import { computeTopTopics } from "@/shared/lib/dashboardTopics";
import { buildProviderHealth } from "@/shared/lib/providerHealth";
import {
  bookingConversionPercent,
  computeQualificationFunnel,
  mergeActivityFeed,
  resolveRangeWindow,
  isDashboardRange,
  computeLanguageSplit,
  computeDailySeries,
  computeWhatsAppBreakdown,
  computeEmailBreakdown,
  deriveBlockers,
} from "@/shared/lib/dashboardLive";

export const dynamic = "force-dynamic";

/**
 * Real metrics for the dashboard overview.
 *
 * This exists because /dashboard previously rendered hardcoded figures —
 * 1,284 conversations, 412 leads, a fabricated "+18.4% vs last week", and two
 * invented people in the recent-leads table. Every number below is computed
 * from this company's own rows.
 *
 * Counts use `head: true` so Postgres returns the count without transferring
 * any rows; only the small recent-leads/recent-conversations lists are
 * actually fetched.
 */
export async function GET(req: NextRequest) {
  try {
    const companyId = req.nextUrl.searchParams.get("companyId");
    if (!companyId) return formatApiResponse(null, 400, "companyId query parameter is required");

    await requireCompanyAccess(req, companyId, "read:leads");

    const now = Date.now();
    const weekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
    const twoWeeksAgo = new Date(now - 14 * 24 * 60 * 60 * 1000).toISOString();
    const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();
    // "Today" starts at the OWNER's local midnight, which only their browser
    // knows — it arrives as a bounded ISO timestamp (never trusted beyond
    // being a date within the last 48h; anything else falls back to UTC
    // midnight). Tenant scoping is untouched by this value.
    const todayStartParam = req.nextUrl.searchParams.get("todayStart");
    const todayStartMs = todayStartParam ? Date.parse(todayStartParam) : NaN;
    const todayStart =
      Number.isFinite(todayStartMs) && now - todayStartMs < 48 * 60 * 60 * 1000 && todayStartMs <= now
        ? new Date(todayStartMs).toISOString()
        : new Date(new Date(now).setUTCHours(0, 0, 0, 0)).toISOString();

    const scoped = () => supabaseAdmin.from("leads").select("id", { count: "exact", head: true }).eq("company_id", companyId).is("deleted_at", null);

    // ---- Owner-selected range (single-page control centre) ----------------
    // One extra batch, started alongside everything else, that answers the
    // "how much am I using, over what period" half of the page. Rows are
    // narrow (started_at + duration + language) and bounded, so the trend and
    // the range KPIs cost one round trip rather than one per widget.
    const rangeParam = req.nextUrl.searchParams.get("range");
    const rangeWindow = resolveRangeWindow(isDashboardRange(rangeParam) ? rangeParam : "30d", now, todayStartParam);
    const rangeBatch = Promise.all([
      supabaseAdmin
        .from("conversations")
        .select("started_at, duration_seconds, language, status")
        .eq("company_id", companyId)
        .gte("started_at", rangeWindow.sinceIso)
        .order("started_at", { ascending: false })
        .limit(5000),
      supabaseAdmin
        .from("appointments")
        .select("id", { count: "exact", head: true })
        .eq("company_id", companyId)
        .gte("created_at", rangeWindow.sinceIso),
      // Email outcomes are company-scoped and small; the breakdown needs the
      // provider id to tell a real acceptance from a simulated one.
      supabaseAdmin
        .from("email_logs")
        .select("status, provider_message_id, template_name")
        .eq("company_id", companyId)
        .gte("created_at", rangeWindow.sinceIso)
        .limit(1000),
    ]);

    // ---- Live-overview additions (all company-scoped, all bounded) -------
    // Started HERE — before the core batch is awaited — because nothing in
    // it depends on the core batch's results (only companyId and the date
    // constants above). Awaiting the two batches serially doubled the DB
    // round-trip latency of the endpoint for no reason (2026-08-19 audit).
    const liveOverviewBatch = Promise.all([
      supabaseAdmin.from("conversations").select("id", { count: "exact", head: true }).eq("company_id", companyId).gte("created_at", todayStart),
      supabaseAdmin
        .from("conversations")
        .select("duration_seconds")
        .eq("company_id", companyId)
        .gte("created_at", todayStart)
        .not("duration_seconds", "is", null)
        .limit(2000),
      supabaseAdmin
        .from("conversations")
        .select("duration_seconds")
        .eq("company_id", companyId)
        .gte("created_at", weekAgo)
        .not("duration_seconds", "is", null)
        .limit(2000),
      // Funnel input: only leads that recorded at least one authored answer
      // in the last 30 days — the regex counting happens in a pure,
      // unit-tested helper.
      supabaseAdmin
        .from("leads")
        .select("qualification_notes")
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .gte("created_at", thirtyDaysAgo)
        .like("qualification_notes", "%Q1 [%")
        .limit(2000),
      supabaseAdmin.from("appointments").select("id", { count: "exact", head: true }).eq("company_id", companyId).gte("created_at", todayStart),
      supabaseAdmin.from("appointments").select("id", { count: "exact", head: true }).eq("company_id", companyId).eq("status", "CANCELLED"),
      supabaseAdmin
        .from("appointments")
        .select("id, start_time, status, lead:leads(name)")
        .eq("company_id", companyId)
        .gte("start_time", new Date(now).toISOString())
        .in("status", ["BOOKED", "REQUESTED"])
        .order("start_time", { ascending: true })
        .limit(5),
      supabaseAdmin
        .from("appointments")
        .select("created_at, status, start_time")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false })
        .limit(8),
      // Inbound WhatsApp qualification conversations — recorded on the
      // company-scoped conversations table (channel column), never inferred.
      supabaseAdmin
        .from("conversations")
        .select("id", { count: "exact", head: true })
        .eq("company_id", companyId)
        .eq("channel", "whatsapp"),
      supabaseAdmin
        .from("lead_activities")
        .select("created_at, content, metadata")
        .eq("company_id", companyId)
        .in("content", ["appointment_notifications", "whatsapp_reminder_24h"])
        .order("created_at", { ascending: false })
        .limit(8),
      // The durable per-conversation owner-summary outcomes stamped by the
      // Vapi webhook — the ONLY honest source for "did the owner summary
      // actually send".
      supabaseAdmin
        .from("conversations")
        .select("started_at, status, duration_seconds, channel, intent, audio_metadata")
        .eq("company_id", companyId)
        .not("audio_metadata->summaryNotification", "is", null)
        .order("started_at", { ascending: false })
        .limit(8),
    ]);

    const [
      conversations,
      conversationsThisWeek,
      conversationsPriorWeek,
      leads,
      qualifiedLeads,
      appointmentsBooked,
      appointmentsPending,
      durations,
      recentLeads,
      recentConversations,
      toolsCalledSample,
    ] = await Promise.all([
      supabaseAdmin.from("conversations").select("id", { count: "exact", head: true }).eq("company_id", companyId),
      supabaseAdmin.from("conversations").select("id", { count: "exact", head: true }).eq("company_id", companyId).gte("created_at", weekAgo),
      supabaseAdmin
        .from("conversations")
        .select("id", { count: "exact", head: true })
        .eq("company_id", companyId)
        .gte("created_at", twoWeeksAgo)
        .lt("created_at", weekAgo),
      scoped(),
      supabaseAdmin
        .from("leads")
        .select("id", { count: "exact", head: true })
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .in("score_category", ["HIGH", "MEDIUM"]),
      supabaseAdmin.from("appointments").select("id", { count: "exact", head: true }).eq("company_id", companyId).eq("status", "BOOKED"),
      // Surfaced separately because a REQUESTED appointment has no calendar
      // event behind it and is waiting on a human — it is a to-do, not a win.
      supabaseAdmin.from("appointments").select("id", { count: "exact", head: true }).eq("company_id", companyId).eq("status", "REQUESTED"),
      // Ordered so the cap is "the 500 most recent" — without the order,
      // Postgres returns an ARBITRARY 500 once the table outgrows the cap
      // and the average silently loses meaning (2026-08-19 audit).
      supabaseAdmin
        .from("conversations")
        .select("duration_seconds")
        .eq("company_id", companyId)
        .not("duration_seconds", "is", null)
        .order("created_at", { ascending: false })
        .limit(500),
      supabaseAdmin
        .from("leads")
        .select("id, name, email, score, score_category, status, created_at")
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(5),
      supabaseAdmin
        .from("conversations")
        .select("id, employee_id, status, started_at, ended_at, duration_seconds, summary, sentiment, channel, intent, audio_metadata")
        .eq("company_id", companyId)
        .order("started_at", { ascending: false })
        .limit(8),
      // Bounded sample, same cap as the duration average above — aggregating
      // in JS over a capped set beats a second round trip for a bar-count
      // query Postgres has no simpler way to express against a text[] column.
      // Same most-recent-500 ordering rationale as the durations sample.
      supabaseAdmin
        .from("conversations")
        .select("tools_called")
        .eq("company_id", companyId)
        .not("tools_called", "eq", "{}")
        .order("created_at", { ascending: false })
        .limit(500),
    ]);

    const [
      conversationsToday,
      minutesTodayRows,
      minutes7dRows,
      funnelRows,
      appointmentsToday,
      appointmentsCancelled,
      upcomingAppointments,
      recentAppointments,
      inboundWhatsApp,
      notificationActivities,
      summaryStampRows,
    ] = await liveOverviewBatch;

    const conversationRows = recentConversations.data ?? [];
    const employeeIds = [...new Set(conversationRows.map((c) => c.employee_id).filter(Boolean))];
    const employeeNames = new Map<string, string>();
    if (employeeIds.length > 0) {
      const { data: employeeRows } = await supabaseAdmin.from("employees").select("id, name").in("id", employeeIds);
      for (const e of employeeRows ?? []) employeeNames.set(e.id, e.name);
    }

    const topTopics = computeTopTopics(toolsCalledSample.data ?? []);

    const durationValues = (durations.data ?? []).map((d) => Number(d.duration_seconds)).filter((n) => Number.isFinite(n));
    const avgDurationSeconds =
      durationValues.length > 0 ? Math.round(durationValues.reduce((sum, n) => sum + n, 0) / durationValues.length) : null;

    const thisWeek = conversationsThisWeek.count ?? 0;
    const priorWeek = conversationsPriorWeek.count ?? 0;
    // Null rather than 0% when there is no prior week to compare against —
    // "0% change" would imply a real measurement that hasn't been made.
    const weekOverWeekPercent = priorWeek > 0 ? Math.round(((thisWeek - priorWeek) / priorWeek) * 1000) / 10 : null;

    const totalLeads = leads.count ?? 0;
    const totalConversations = conversations.count ?? 0;

    const sumMinutes = (rows: Array<{ duration_seconds: unknown }> | null) =>
      Math.round(((rows ?? []).map((r) => Number(r.duration_seconds)).filter((n) => Number.isFinite(n) && n > 0).reduce((a, b) => a + b, 0) / 60) * 10) / 10;

    const funnel = computeQualificationFunnel(funnelRows.data ?? []);
    const bookedCount = appointmentsBooked.count ?? 0;

    // Owner-summary WhatsApp outcomes, straight from the stamped records.
    const summaryStamps = (summaryStampRows.data ?? []) as Array<{
      started_at: string;
      status: string;
      duration_seconds: number | null;
      channel?: string | null;
      intent?: string | null;
      audio_metadata: { summaryNotification?: { sent: boolean; reason?: string | null; at?: string } } | null;
    }>;
    const summarySent = summaryStamps.filter((s) => s.audio_metadata?.summaryNotification?.sent).length;
    const summaryFailed = summaryStamps.filter((s) => s.audio_metadata?.summaryNotification && !s.audio_metadata.summaryNotification.sent).length;

    const activityFeed = mergeActivityFeed(
      conversationRows as Array<{
        started_at: string;
        status: string;
        duration_seconds: number | null;
        channel?: string | null;
        intent?: string | null;
        audio_metadata?: { summaryNotification?: { sent: boolean; reason?: string | null } } | null;
      }>,
      (recentAppointments.data ?? []) as Array<{ created_at: string; status: string; start_time: string }>,
      (notificationActivities.data ?? []) as Array<{ created_at: string; content: string | null; metadata?: Record<string, unknown> | null }>
    );

    const [rangeConversations, rangeAppointments, rangeEmails] = await rangeBatch;
    const rangeRows = (rangeConversations.data ?? []) as Array<{
      started_at: string;
      duration_seconds: number | null;
      language: string | null;
      status: string;
    }>;
    const rangeSeconds = rangeRows.reduce((sum, r) => sum + (Number(r.duration_seconds) || 0), 0);
    const whatsappBreakdown = computeWhatsAppBreakdown(
      summaryStamps as Array<{ channel?: string | null; audio_metadata?: { summaryNotification?: { sent: boolean } } | null }>,
      (notificationActivities.data ?? []) as Array<{ created_at: string; content: string | null; metadata?: Record<string, unknown> | null }>
    );
    // WhatsApp-channel conversations are counted from the dedicated count
    // query (whole history), not the range rows, so the category cannot
    // silently change meaning with the selected range.
    whatsappBreakdown.qualificationConversations = inboundWhatsApp.count ?? 0;
    const emailBreakdown = computeEmailBreakdown(
      (rangeEmails.data ?? []) as Array<{ status?: string | null; provider_message_id?: string | null; template_name?: string | null }>
    );
    const health = await buildProviderHealth({});

    return formatApiResponse(
      {
        generatedAt: new Date().toISOString(),
        // ---- Owner-selected range ------------------------------------------
        range: {
          key: rangeWindow.range,
          label: rangeWindow.label,
          sinceIso: rangeWindow.sinceIso,
          conversations: rangeRows.length,
          voiceMinutes: Math.round((rangeSeconds / 60) * 10) / 10,
          completedConversations: rangeRows.filter((r) => r.status !== "FAILED").length,
          appointments: rangeAppointments.count ?? 0,
          // Averages need a denominator; null renders as "—", never as 0s.
          avgDurationSeconds: rangeRows.length > 0 ? Math.round(rangeSeconds / rangeRows.length) : null,
          longestCallSeconds: rangeRows.reduce((max, r) => Math.max(max, Number(r.duration_seconds) || 0), 0) || null,
          languageSplit: computeLanguageSplit(rangeRows),
          series: computeDailySeries(rangeRows, rangeWindow, now),
        },
        whatsappBreakdown,
        email: {
          ...emailBreakdown,
          // The provider gives no delivery callback, so the page must say
          // "accepted", never "delivered".
          deliveryConfirmable: false,
          providerState: health.email,
        },
        // Pitch/introduction playback is NOT instrumented anywhere in this
        // system — no table records a play, a render or a cache hit. Rather
        // than invent counts, the page states what is and isn't measurable
        // and shows the provider configuration that IS real.
        tts: {
          playbackInstrumented: false,
          note: "Pitch and introduction playback is not instrumented; only provider state is measurable.",
          providerState: health.tts,
        },
        issues: deriveBlockers(health as unknown as Record<string, string>, whatsappBreakdown, emailBreakdown),
        totalConversations,
        conversationsThisWeek: thisWeek,
        weekOverWeekPercent,
        totalLeads,
        qualifiedLeads: qualifiedLeads.count ?? 0,
        appointmentsBooked: appointmentsBooked.count ?? 0,
        appointmentsPendingConfirmation: appointmentsPending.count ?? 0,
        avgDurationSeconds,
        // Null when there are no conversations — a 0% conversion rate reads as
        // a measured failure rather than an absence of data.
        leadConversionPercent: totalConversations > 0 ? Math.round((totalLeads / totalConversations) * 1000) / 10 : null,
        recentLeads: recentLeads.data ?? [],
        recentConversations: conversationRows.map((c) => ({
          id: c.id,
          employeeName: employeeNames.get(c.employee_id) ?? "Unknown",
          status: c.status,
          startedAt: c.started_at,
          endedAt: c.ended_at,
          durationSeconds: c.duration_seconds,
          summary: c.summary,
          sentiment: c.sentiment,
        })),
        // Empty rather than padded with zero-count topics — the widget shows
        // "no calls have asked about anything yet" instead of a fake ranking.
        topTopics,
        // ---- Live overview -------------------------------------------------
        conversationsToday: conversationsToday.count ?? 0,
        appointmentsToday: appointmentsToday.count ?? 0,
        voiceMinutesToday: sumMinutes(minutesTodayRows.data),
        voiceMinutes7d: sumMinutes(minutes7dRows.data),
        qualificationFunnel: funnel,
        // Explicit formula, surfaced in the UI verbatim. Null denominator →
        // null, rendered as "—", never 0%.
        bookingConversion: {
          definition: "Confirmed appointments ÷ completed six-question qualifications (last 30 days of qualifications).",
          numerator: bookedCount,
          denominator: funnel.completed,
          percent: bookingConversionPercent(bookedCount, funnel.completed),
        },
        appointmentsCancelled: appointmentsCancelled.count ?? 0,
        upcomingAppointments: ((upcomingAppointments.data ?? []) as Array<{ id: string; start_time: string; status: string; lead: { name: string | null } | Array<{ name: string | null }> | null }>).map(
          (a) => ({
            id: a.id,
            startTime: a.start_time,
            status: a.status,
            leadName: (Array.isArray(a.lead) ? a.lead[0]?.name : a.lead?.name) ?? "Visitor",
          })
        ),
        whatsapp: {
          inboundConversations: inboundWhatsApp.count ?? 0,
          ownerSummaries: {
            sent: summarySent,
            failed: summaryFailed,
            lastOutcome: summaryStamps[0]?.audio_metadata?.summaryNotification ?? null,
          },
        },
        // Same object the range/issues blocks above were derived from —
        // computed once per request, never probed twice.
        providerHealth: health,
        activityFeed,
      },
      200,
      "Dashboard statistics retrieved successfully"
    );
  } catch (error) {
    return handleApiError(error);
  }
}
