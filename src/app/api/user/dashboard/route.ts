import { NextRequest } from "next/server";
import { formatApiResponse } from "@/shared/lib/security";
import { handleApiError } from "@/shared/lib/apiHandler";
import { requireOwnCompanyScope } from "@/shared/lib/dashboardScope";
import { supabaseAdmin } from "@/shared/lib/supabase";
import { buildProviderHealth } from "@/shared/lib/providerHealth";
import {
  bookingConversionPercent,
  computeQualificationFunnel,
  computeDailySeries,
  computeLanguageSplit,
  computeWhatsAppBreakdown,
  computeEmailBreakdown,
  mergeActivityFeed,
  resolveRangeWindow,
  isDashboardRange,
} from "@/shared/lib/dashboardLive";

export const dynamic = "force-dynamic";

/**
 * The USER dashboard's only data source.
 *
 * The defining property: this route accepts NO companyId. The tenant comes
 * from requireOwnCompanyScope, which reads it off the session's active
 * membership — so there is no parameter a crafted id could travel through,
 * and no code path in which a client-supplied tenant is trusted. Every query
 * below filters on that server-derived id.
 *
 * It deliberately returns nothing platform-wide: no other company's rows, no
 * cross-tenant totals, no deployment/system information, and only the
 * provider states that affect THIS company's own service.
 */
export async function GET(req: NextRequest) {
  try {
    const scope = await requireOwnCompanyScope(req);
    const companyId = scope.companyId;

    const now = Date.now();
    const rangeParam = req.nextUrl.searchParams.get("range");
    const window = resolveRangeWindow(
      isDashboardRange(rangeParam) ? rangeParam : "30d",
      now,
      req.nextUrl.searchParams.get("todayStart")
    );

    const scopedCount = (table: string) =>
      supabaseAdmin.from(table).select("id", { count: "exact", head: true }).eq("company_id", companyId);

    const [
      company,
      conversationRows,
      appointmentsBooked,
      appointmentsRequested,
      appointmentsCancelled,
      upcoming,
      qualificationLeads,
      summaryStamps,
      activities,
      emailRows,
      recentAppointments,
    ] = await Promise.all([
      supabaseAdmin.from("companies").select("id, name, website").eq("id", companyId).maybeSingle(),
      // Narrow columns, tenant-filtered, date-bounded and capped — never a
      // raw table dump to the browser.
      supabaseAdmin
        .from("conversations")
        .select("started_at, duration_seconds, language, status, channel, intent, audio_metadata")
        .eq("company_id", companyId)
        .gte("started_at", window.sinceIso)
        .order("started_at", { ascending: false })
        .limit(5000),
      scopedCount("appointments").eq("status", "BOOKED"),
      scopedCount("appointments").eq("status", "REQUESTED"),
      scopedCount("appointments").eq("status", "CANCELLED"),
      supabaseAdmin
        .from("appointments")
        .select("id, start_time, status, timezone")
        .eq("company_id", companyId)
        .gte("start_time", new Date(now).toISOString())
        .in("status", ["BOOKED", "REQUESTED"])
        .order("start_time", { ascending: true })
        .limit(5),
      supabaseAdmin
        .from("leads")
        .select("qualification_notes")
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .gte("created_at", window.sinceIso)
        .like("qualification_notes", "%Q1 [%")
        .limit(2000),
      supabaseAdmin
        .from("conversations")
        .select("channel, audio_metadata")
        .eq("company_id", companyId)
        .not("audio_metadata->summaryNotification", "is", null)
        .limit(500),
      supabaseAdmin
        .from("lead_activities")
        .select("created_at, content, metadata")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false })
        .limit(20),
      supabaseAdmin
        .from("email_logs")
        .select("status, provider_message_id, template_name")
        .eq("company_id", companyId)
        .gte("created_at", window.sinceIso)
        .limit(500),
      supabaseAdmin
        .from("appointments")
        .select("created_at, status, start_time")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false })
        .limit(10),
    ]);

    const rows = (conversationRows.data ?? []) as Array<{
      started_at: string;
      duration_seconds: number | null;
      language: string | null;
      status: string;
      channel?: string | null;
      intent?: string | null;
      audio_metadata?: { summaryNotification?: { sent: boolean; reason?: string | null } } | null;
    }>;
    const seconds = rows.reduce((sum, r) => sum + (Number(r.duration_seconds) || 0), 0);
    const funnel = computeQualificationFunnel((qualificationLeads.data ?? []) as Array<{ qualification_notes: string | null }>);
    const booked = appointmentsBooked.count ?? 0;

    const health = await buildProviderHealth({});

    return formatApiResponse(
      {
        generatedAt: new Date().toISOString(),
        user: { email: scope.user.email, role: scope.isPlatformAdmin ? "PLATFORM_ADMIN" : scope.role },
        company: { id: companyId, name: company.data?.name ?? null, website: company.data?.website ?? null },
        range: {
          key: window.range,
          label: window.label,
          sinceIso: window.sinceIso,
          conversations: rows.length,
          voiceMinutes: Math.round((seconds / 60) * 10) / 10,
          avgDurationSeconds: rows.length > 0 ? Math.round(seconds / rows.length) : null,
          longestCallSeconds: rows.reduce((m, r) => Math.max(m, Number(r.duration_seconds) || 0), 0) || null,
          languageSplit: computeLanguageSplit(rows),
          series: computeDailySeries(rows, window, now),
        },
        qualificationFunnel: funnel,
        bookingConversion: {
          definition: "Confirmed appointments ÷ completed six-question qualifications.",
          numerator: booked,
          denominator: funnel.completed,
          percent: bookingConversionPercent(booked, funnel.completed),
        },
        appointments: {
          booked,
          requested: appointmentsRequested.count ?? 0,
          cancelled: appointmentsCancelled.count ?? 0,
          upcoming: ((upcoming.data ?? []) as Array<{ id: string; start_time: string; status: string; timezone: string | null }>).map((a) => ({
            id: a.id,
            startTime: a.start_time,
            status: a.status,
            timezone: a.timezone,
          })),
        },
        whatsapp: computeWhatsAppBreakdown(
          (summaryStamps.data ?? []) as Array<{ channel?: string | null; audio_metadata?: { summaryNotification?: { sent: boolean } } | null }>,
          (activities.data ?? []) as Array<{ created_at: string; content: string | null; metadata?: Record<string, unknown> | null }>
        ),
        email: {
          ...computeEmailBreakdown((emailRows.data ?? []) as Array<{ status?: string | null; provider_message_id?: string | null; template_name?: string | null }>),
          deliveryConfirmable: false,
          providerState: health.email,
        },
        // Only the provider states that affect THIS company's own service.
        // Deployment, cron and database health are platform concerns and are
        // deliberately absent from the user surface.
        serviceStatus: {
          aiVoice: health.vapi,
          calendar: health.calendar,
          whatsapp: health.whatsapp,
          email: health.email,
          pitchAudio: health.tts,
        },
        activity: mergeActivityFeed(
          rows,
          (recentAppointments.data ?? []) as Array<{ created_at: string; status: string; start_time: string }>,
          (activities.data ?? []) as Array<{ created_at: string; content: string | null; metadata?: Record<string, unknown> | null }>,
          12
        ),
      },
      200,
      "Dashboard retrieved successfully"
    );
  } catch (error) {
    return handleApiError(error);
  }
}
