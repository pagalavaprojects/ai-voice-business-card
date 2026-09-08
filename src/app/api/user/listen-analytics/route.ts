import { NextRequest } from "next/server";
import { formatApiResponse } from "@/shared/lib/security";
import { handleApiError } from "@/shared/lib/apiHandler";
import { requireOwnCompanyScope } from "@/shared/lib/dashboardScope";
import { supabaseAdmin } from "@/shared/lib/supabase";

export const dynamic = "force-dynamic";

/**
 * Per-user card-listening analytics for the dashboard (requirement 14).
 *
 * REAL data only, from listen_events (genuine user-initiated plays, deduped by
 * event id — background prefetch/warm-up is never recorded). Tenant- and
 * employee-scoped exactly like the rest of the dashboard: an OWNER/ADMIN sees
 * the whole company, a staff member only their own employee's rows.
 *
 * Reports, per the business ask: plays per clip (Introduction, Introduction
 * replays, Elevator, Service, Why Us, Smart AI Lead), users who listened
 * today / this week, total plays today / this week, a 7-day daily trend,
 * per-visitor breakdown, data points answered per lead (from the existing
 * qualification record) and appointments booked (from the appointments table).
 *
 * Fail-open: if the listen_events table is ever unavailable, the listen
 * section reports telemetryEnabled:false with empty counts instead of
 * erroring — the data-point and appointment views need no new table.
 */
const TYPES = ["intro_play", "intro_replay", "elevator_play", "product_play", "usp_play", "smart_play"] as const;
type EventType = (typeof TYPES)[number];
type TypeKey = "intro" | "replay" | "elevator" | "product" | "usp" | "smart";
const KEY: Record<EventType, TypeKey> = {
  intro_play: "intro",
  intro_replay: "replay",
  elevator_play: "elevator",
  product_play: "product",
  usp_play: "usp",
  smart_play: "smart",
};
const DAY_MS = 24 * 3600_000;
const TREND_DAYS = 7;

export async function GET(req: NextRequest) {
  try {
    const scope = await requireOwnCompanyScope(req);
    const companyId = scope.companyId;
    const employeeScoped = scope.breadth === "employee";
    const ownEmployeeId = scope.employeeId ?? "00000000-0000-0000-0000-000000000000";

    const now = Date.now();
    // The dashboard passes its LOCAL midnight so "today" and the daily trend
    // buckets follow the viewer's calendar, not the server's UTC day.
    const todayStartParam = req.nextUrl.searchParams.get("todayStart");
    const todayStart = todayStartParam && !Number.isNaN(Date.parse(todayStartParam)) ? Date.parse(todayStartParam) : new Date(new Date(now).toISOString().slice(0, 10)).getTime();
    // The trend window: the 7 local days ending today. The listen query is
    // bounded by it (a superset of the rolling 7x24h "this week" window).
    const trendStart = todayStart - (TREND_DAYS - 1) * DAY_MS;
    const weekStart = now - 7 * DAY_MS;
    const queryStart = Math.min(trendStart, weekStart);

    // --- Listen events (fail-open on a missing table) ---
    let listenQuery = supabaseAdmin
      .from("listen_events")
      .select("event_type, session_id, created_at")
      .eq("company_id", companyId)
      .gte("created_at", new Date(queryStart).toISOString())
      .order("created_at", { ascending: false })
      .limit(5000);
    if (employeeScoped) listenQuery = listenQuery.eq("employee_id", ownEmployeeId);
    const listen = await listenQuery;

    const telemetryEnabled = !(listen.error && listen.error.code === "42P01");
    const rows = (telemetryEnabled ? (listen.data ?? []) : []) as Array<{ event_type: string; session_id: string; created_at: string }>;

    const byType: Record<TypeKey, number> = { intro: 0, replay: 0, elevator: 0, product: 0, usp: 0, smart: 0 };
    const todaySessions = new Set<string>();
    const weekSessions = new Set<string>();
    let todayPlays = 0;
    let weekPlays = 0;
    const trendCounts = new Array<number>(TREND_DAYS).fill(0);
    const perSession = new Map<string, { session: string; intro: number; replay: number; elevator: number; product: number; usp: number; smart: number; total: number; lastAt: string }>();
    for (const r of rows) {
      const k = KEY[r.event_type as EventType];
      if (!k) continue;
      const at = Date.parse(r.created_at);
      const inWeek = at >= weekStart;
      if (inWeek) {
        byType[k] += 1;
        weekPlays += 1;
        weekSessions.add(r.session_id);
      }
      if (at >= todayStart) {
        todayPlays += 1;
        todaySessions.add(r.session_id);
      }
      const dayIdx = Math.floor((at - trendStart) / DAY_MS);
      if (dayIdx >= 0 && dayIdx < TREND_DAYS) trendCounts[dayIdx] += 1;
      if (!inWeek) continue;
      let s = perSession.get(r.session_id);
      if (!s) {
        s = { session: r.session_id.slice(0, 8), intro: 0, replay: 0, elevator: 0, product: 0, usp: 0, smart: 0, total: 0, lastAt: r.created_at };
        perSession.set(r.session_id, s);
      }
      s[k] += 1;
      s.total += 1;
    }
    const trend = trendCounts.map((plays, i) => ({ day: new Date(trendStart + i * DAY_MS).toISOString().slice(0, 10), plays }));

    // --- Data points answered per lead (from existing qualification_notes) ---
    let leadQuery = supabaseAdmin
      .from("leads")
      .select("id, name, qualification_notes, created_at")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (employeeScoped) leadQuery = leadQuery.eq("employee_id", ownEmployeeId);
    const leads = await leadQuery;
    const dataPointsByLead = (leads.error ? [] : (leads.data ?? []))
      .map((l: { id: string; name: string | null; qualification_notes: string | null }) => {
        const answered = new Set(
          (l.qualification_notes ?? "")
            .split("\n")
            .map((line) => /^Q([1-6]) \[(?:YES|NO|MAYBE)\]/.exec(line.trim()))
            .filter((m): m is RegExpExecArray => m !== null)
            .map((m) => m[1])
        ).size;
        return { lead: l.name || "Lead", answered };
      })
      .filter((d: { answered: number }) => d.answered > 0)
      .slice(0, 20);

    // --- Appointments booked (same scope; BOOKED = confirmed by the calendar,
    // REQUESTED = awaiting confirmation — never conflated) ---
    let apptQuery = supabaseAdmin.from("appointments").select("status, created_at").eq("company_id", companyId).order("created_at", { ascending: false }).limit(5000);
    if (employeeScoped) apptQuery = apptQuery.eq("employee_id", ownEmployeeId);
    const appts = await apptQuery;
    const apptRows = (appts.error ? [] : (appts.data ?? [])) as Array<{ status?: string; created_at?: string }>;
    const appointments = { bookedWeek: 0, bookedTotal: 0, requestedTotal: 0 };
    for (const a of apptRows) {
      if (a.status === "BOOKED") {
        appointments.bookedTotal += 1;
        if (a.created_at && Date.parse(a.created_at) >= weekStart) appointments.bookedWeek += 1;
      } else if (a.status === "REQUESTED") {
        appointments.requestedTotal += 1;
      }
    }

    return formatApiResponse(
      {
        telemetryEnabled,
        totals: { todayUsers: todaySessions.size, weekUsers: weekSessions.size, todayPlays, weekPlays },
        byType,
        trend,
        perSession: [...perSession.values()].sort((a, b) => b.total - a.total).slice(0, 20),
        dataPointsByLead,
        appointments,
      },
      200,
      "Listening analytics retrieved"
    );
  } catch (error) {
    return handleApiError(error);
  }
}
