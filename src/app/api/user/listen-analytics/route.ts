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
 * Fail-open: while the listen_events table is pending its authorized apply, the
 * listen section reports telemetryEnabled:false with empty counts instead of
 * erroring — the data-point-per-lead view (from existing qualification_notes)
 * still works, since it needs no new table.
 */
const TYPES = ["intro_play", "elevator_play", "product_play", "usp_play"] as const;
type EventType = (typeof TYPES)[number];
const KEY: Record<EventType, "intro" | "elevator" | "product" | "usp"> = {
  intro_play: "intro",
  elevator_play: "elevator",
  product_play: "product",
  usp_play: "usp",
};

export async function GET(req: NextRequest) {
  try {
    const scope = await requireOwnCompanyScope(req);
    const companyId = scope.companyId;
    const employeeScoped = scope.breadth === "employee";
    const ownEmployeeId = scope.employeeId ?? "00000000-0000-0000-0000-000000000000";

    const now = Date.now();
    const todayStartParam = req.nextUrl.searchParams.get("todayStart");
    const todayStart = todayStartParam && !Number.isNaN(Date.parse(todayStartParam)) ? Date.parse(todayStartParam) : new Date(new Date(now).toISOString().slice(0, 10)).getTime();
    const weekStart = now - 7 * 24 * 3600_000;

    // --- Listen events (fail-open on a missing table) ---
    let listenQuery = supabaseAdmin
      .from("listen_events")
      .select("event_type, session_id, created_at")
      .eq("company_id", companyId)
      .gte("created_at", new Date(weekStart).toISOString())
      .order("created_at", { ascending: false })
      .limit(5000);
    if (employeeScoped) listenQuery = listenQuery.eq("employee_id", ownEmployeeId);
    const listen = await listenQuery;

    const telemetryEnabled = !(listen.error && listen.error.code === "42P01");
    const rows = (telemetryEnabled ? (listen.data ?? []) : []) as Array<{ event_type: string; session_id: string; created_at: string }>;

    const byType = { intro: 0, elevator: 0, product: 0, usp: 0 };
    const todaySessions = new Set<string>();
    const weekSessions = new Set<string>();
    const perSession = new Map<string, { session: string; intro: number; elevator: number; product: number; usp: number; total: number; lastAt: string }>();
    for (const r of rows) {
      const k = KEY[r.event_type as EventType];
      if (!k) continue;
      byType[k] += 1;
      weekSessions.add(r.session_id);
      if (Date.parse(r.created_at) >= todayStart) todaySessions.add(r.session_id);
      let s = perSession.get(r.session_id);
      if (!s) {
        s = { session: r.session_id.slice(0, 8), intro: 0, elevator: 0, product: 0, usp: 0, total: 0, lastAt: r.created_at };
        perSession.set(r.session_id, s);
      }
      s[k] += 1;
      s.total += 1;
    }

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

    return formatApiResponse(
      {
        telemetryEnabled,
        totals: { todayUsers: todaySessions.size, weekUsers: weekSessions.size },
        byType,
        perSession: [...perSession.values()].sort((a, b) => b.total - a.total).slice(0, 20),
        dataPointsByLead,
      },
      200,
      "Listening analytics retrieved"
    );
  } catch (error) {
    return handleApiError(error);
  }
}
