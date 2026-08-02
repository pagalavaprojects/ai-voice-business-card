import { NextRequest } from "next/server";
import { formatApiResponse } from "@/shared/lib/security";
import { handleApiError } from "@/shared/lib/apiHandler";
import { requireCompanyAccess } from "@/shared/lib/tenant";
import { supabaseAdmin } from "@/shared/lib/supabase";

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
 * any rows; only the small recent-leads list is actually fetched.
 */
export async function GET(req: NextRequest) {
  try {
    const companyId = req.nextUrl.searchParams.get("companyId");
    if (!companyId) return formatApiResponse(null, 400, "companyId query parameter is required");

    await requireCompanyAccess(req, companyId, "read:leads");

    const now = Date.now();
    const weekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
    const twoWeeksAgo = new Date(now - 14 * 24 * 60 * 60 * 1000).toISOString();

    const scoped = () => supabaseAdmin.from("leads").select("id", { count: "exact", head: true }).eq("company_id", companyId).is("deleted_at", null);

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
      supabaseAdmin.from("conversations").select("duration_seconds").eq("company_id", companyId).not("duration_seconds", "is", null).limit(500),
      supabaseAdmin
        .from("leads")
        .select("id, name, email, score, score_category, status, created_at")
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(5),
    ]);

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

    return formatApiResponse(
      {
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
      },
      200,
      "Dashboard statistics retrieved successfully"
    );
  } catch (error) {
    return handleApiError(error);
  }
}
