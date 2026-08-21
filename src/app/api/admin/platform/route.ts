import { NextRequest } from "next/server";
import { formatApiResponse } from "@/shared/lib/security";
import { handleApiError } from "@/shared/lib/apiHandler";
import { requirePlatformAdmin } from "@/shared/lib/dashboardScope";
import { supabaseAdmin } from "@/shared/lib/supabase";
import { buildProviderHealth } from "@/shared/lib/providerHealth";
import {
  computeQualificationFunnel,
  computeDailySeries,
  computeLanguageSplit,
  computeWhatsAppBreakdown,
  computeEmailBreakdown,
  deriveBlockers,
  bookingConversionPercent,
  resolveRangeWindow,
  isDashboardRange,
} from "@/shared/lib/dashboardLive";

export const dynamic = "force-dynamic";

/**
 * The ADMIN dashboard's platform-wide data — every company's rows together.
 *
 * Gated on `users.is_platform_admin` alone (requirePlatformAdmin). A company
 * OWNER is the top of THEIR tenant, not of the platform, so owning a company
 * grants nothing here: this is the one endpoint whose whole purpose is
 * cross-tenant, and it is therefore the one that must refuse every
 * company-scoped role.
 *
 * Counts are computed with `head: true` so Postgres returns totals without
 * transferring rows; the only rows fetched are the bounded, narrow sets the
 * trends and breakdowns genuinely need.
 */
export async function GET(req: NextRequest) {
  try {
    await requirePlatformAdmin(req);

    const now = Date.now();
    const rangeParam = req.nextUrl.searchParams.get("range");
    const window = resolveRangeWindow(
      isDashboardRange(rangeParam) ? rangeParam : "30d",
      now,
      req.nextUrl.searchParams.get("todayStart")
    );

    const count = (table: string) => supabaseAdmin.from(table).select("id", { count: "exact", head: true });

    const [
      companies,
      users,
      employees,
      totalConversations,
      totalLeads,
      apptBooked,
      apptRequested,
      apptCancelled,
      rangeConversations,
      qualificationLeads,
      summaryStamps,
      activities,
      emailRows,
      upcoming,
    ] = await Promise.all([
      count("companies"),
      count("users"),
      count("employees"),
      count("conversations"),
      supabaseAdmin.from("leads").select("id", { count: "exact", head: true }).is("deleted_at", null),
      count("appointments").eq("status", "BOOKED"),
      count("appointments").eq("status", "REQUESTED"),
      count("appointments").eq("status", "CANCELLED"),
      // Platform-wide, so deliberately NOT company-filtered.
      supabaseAdmin
        .from("conversations")
        .select("started_at, duration_seconds, language, status, channel")
        .gte("started_at", window.sinceIso)
        .order("started_at", { ascending: false })
        .limit(10000),
      supabaseAdmin
        .from("leads")
        .select("qualification_notes")
        .is("deleted_at", null)
        .gte("created_at", window.sinceIso)
        .like("qualification_notes", "%Q1 [%")
        .limit(5000),
      supabaseAdmin
        .from("conversations")
        .select("channel, audio_metadata")
        .not("audio_metadata->summaryNotification", "is", null)
        .limit(1000),
      supabaseAdmin
        .from("lead_activities")
        .select("created_at, content, metadata")
        .order("created_at", { ascending: false })
        .limit(50),
      supabaseAdmin.from("email_logs").select("status, provider_message_id, template_name").gte("created_at", window.sinceIso).limit(2000),
      supabaseAdmin
        .from("appointments")
        .select("id, start_time, status")
        .gte("start_time", new Date(now).toISOString())
        .in("status", ["BOOKED", "REQUESTED"])
        .order("start_time", { ascending: true })
        .limit(10),
    ]);

    const rows = (rangeConversations.data ?? []) as Array<{
      started_at: string;
      duration_seconds: number | null;
      language: string | null;
      status: string;
      channel?: string | null;
    }>;
    const seconds = rows.reduce((sum, r) => sum + (Number(r.duration_seconds) || 0), 0);
    const funnel = computeQualificationFunnel((qualificationLeads.data ?? []) as Array<{ qualification_notes: string | null }>);
    const booked = apptBooked.count ?? 0;

    const whatsapp = computeWhatsAppBreakdown(
      (summaryStamps.data ?? []) as Array<{ channel?: string | null; audio_metadata?: { summaryNotification?: { sent: boolean } } | null }>,
      (activities.data ?? []) as Array<{ created_at: string; content: string | null; metadata?: Record<string, unknown> | null }>
    );
    whatsapp.qualificationConversations = rows.filter((r) => r.channel === "whatsapp").length;
    const email = computeEmailBreakdown(
      (emailRows.data ?? []) as Array<{ status?: string | null; provider_message_id?: string | null; template_name?: string | null }>
    );
    const health = await buildProviderHealth({});

    return formatApiResponse(
      {
        generatedAt: new Date().toISOString(),
        platform: {
          companies: companies.count ?? 0,
          users: users.count ?? 0,
          employees: employees.count ?? 0,
          conversations: totalConversations.count ?? 0,
          leads: totalLeads.count ?? 0,
        },
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
          definition: "Confirmed appointments ÷ completed six-question qualifications (platform-wide).",
          numerator: booked,
          denominator: funnel.completed,
          percent: bookingConversionPercent(booked, funnel.completed),
        },
        appointments: {
          booked,
          requested: apptRequested.count ?? 0,
          cancelled: apptCancelled.count ?? 0,
          upcoming: ((upcoming.data ?? []) as Array<{ id: string; start_time: string; status: string }>).map((a) => ({
            id: a.id,
            startTime: a.start_time,
            status: a.status,
          })),
        },
        whatsapp,
        email: { ...email, deliveryConfirmable: false, providerState: health.email },
        // Provider/system states as DERIVED states only — never a raw
        // environment value, and never a credential.
        systemHealth: health,
        environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "unknown",
        issues: deriveBlockers(health as unknown as Record<string, string>, whatsapp, email),
        // Playback is not instrumented anywhere in this system; the admin
        // surface says so rather than inventing platform TTS counts.
        tts: {
          playbackInstrumented: false,
          note: "Pitch and introduction playback is not instrumented; only provider state is measurable.",
          providerState: health.tts,
        },
      },
      200,
      "Platform overview retrieved successfully"
    );
  } catch (error) {
    return handleApiError(error);
  }
}
