import { NextRequest } from "next/server";
import { formatApiResponse } from "@/shared/lib/security";
import { handleApiError } from "@/shared/lib/apiHandler";
import { requireOwnCompanyScope } from "@/shared/lib/dashboardScope";
import { supabaseAdmin } from "@/shared/lib/supabase";

export const dynamic = "force-dynamic";

/**
 * Item 14 — the ONE analytics request behind the Listening & Data Point page
 * (and the compact summary on the dashboards).
 *
 * Everything here is real, server-aggregated data:
 *  - listen_events: genuine, user-initiated plays only (the card never
 *    records prefetch / warm-up / load), deduped by event id at the DB.
 *  - leads.qualification_notes: the server-authoritative data-point record
 *    (`Q<n> [YES|NO|MAYBE] (<iso>): <answer>`), first record per number.
 *
 * "User" = one visitor. Listening is attributed to the card visit's own id
 * (session_id); once that visit answers data points the answer path links
 * its events to the lead (listen_events.lead_id), so a lead's listening and
 * data points appear as ONE row, and a lead with several visits is one user.
 *
 * Time is the VIEWER's: the dashboard passes its local midnight
 * (`todayStart`); "today" runs from it, "7d" is the 7 local calendar days
 * ending today, and the trend buckets are those local days (keyed by their
 * start instant, never by a UTC date).
 *
 * Scope is the signed-in identity's, never a query parameter: OWNER/ADMIN see
 * the company, staff see their own employee. Fixed query count (no N+1):
 * one listen query, one or two lead queries, one appointment query.
 *
 * Status is honest: `listenStatus` distinguishes ok / not_applied (table
 * missing) / unavailable (query error) so the page never paints zeros for
 * data it could not read.
 */
const TYPES = ["intro_play", "intro_replay", "elevator_play", "product_play", "usp_play", "smart_play"] as const;
type EventType = (typeof TYPES)[number];
type ClipKey = "intro" | "replay" | "elevator" | "product" | "usp" | "smart";
const KEY: Record<EventType, ClipKey> = {
  intro_play: "intro",
  intro_replay: "replay",
  elevator_play: "elevator",
  product_play: "product",
  usp_play: "usp",
  smart_play: "smart",
};
const HOUR_MS = 3600_000;
const DAY_MS = 24 * HOUR_MS;
const WINDOW_DAYS = 7;
const MAX_USERS = 100;
const NIL_EMPLOYEE = "00000000-0000-0000-0000-000000000000";
/** todayStart must be a real "today": a crafted far-off value cannot widen
 * the window or fabricate an empty one. */
const MAX_TODAY_SKEW_MS = 36 * 3600_000;

type Classification = "YES" | "NO" | "MAYBE";
type Plays = Record<ClipKey, number> & { total: number };
interface UserRow {
  key: string;
  label: string;
  kind: "lead" | "visitor";
  /** False until the visitor gave real contact details (a bare visit, or a
   * placeholder lead created by the qualification tool). */
  identified: boolean;
  leadId: string | null;
  email: string | null;
  plays: Plays;
  /** DP1..DP6 in order; null = not answered (never inferred). */
  dataPoints: Array<Classification | null>;
  answered: number;
  completed: boolean;
  lastAt: string | null;
}
interface LeadRow {
  id: string;
  name: string | null;
  email: string | null;
  qualification_notes: string | null;
  created_at: string;
}
interface ListenRow {
  event_type: string;
  session_id: string;
  lead_id: string | null;
  created_at: string;
}

const emptyPlays = (): Plays => ({ intro: 0, replay: 0, elevator: 0, product: 0, usp: 0, smart: 0, total: 0 });

/** The qualification tool creates a placeholder lead ("Voice qualification
 * visitor" with an @placeholder.maylaanai.internal address) until the visitor
 * gives real contact details. Such a lead is a real user but not yet
 * identified — it must not be labelled as if it were a named person. */
const PLACEHOLDER_NAME = /^voice qualification visitor$/i;
const PLACEHOLDER_EMAIL = /@placeholder\.maylaanai\.internal$/i;
function identityOf(lead: LeadRow | undefined, leadId: string): { label: string; email: string | null; identified: boolean } {
  const name = lead?.name?.trim() ?? "";
  const email = lead?.email?.trim() ?? "";
  const realName = name && !PLACEHOLDER_NAME.test(name) ? name : "";
  const realEmail = email && !PLACEHOLDER_EMAIL.test(email) ? email : "";
  if (realName || realEmail) return { label: realName || realEmail, email: realEmail || null, identified: true };
  return { label: `Lead ${leadId.slice(0, 8)}`, email: null, identified: false };
}
/** A visit id that is not a UUID (e.g. a long custom id) keeps its tail too,
 * so two visits never share a label. */
const shortId = (s: string) => (s.length > 12 ? `${s.slice(0, 8)}…${s.slice(-4)}` : s.slice(0, 8));

/** The persisted data-point record: one line per answered data point,
 * first record per number wins (the tool never overwrites). Only DP1–DP6
 * exist; anything else is ignored, never surfaced. */
function parseDataPoints(notes: string | null | undefined): Array<{ n: number; c: Classification; at: number }> {
  const seen = new Set<number>();
  const out: Array<{ n: number; c: Classification; at: number }> = [];
  for (const raw of (notes ?? "").split("\n")) {
    const m = /^Q([1-6]) \[(YES|NO|MAYBE)\] \(([^)]*)\): /.exec(raw.trim());
    if (!m) continue;
    const n = Number(m[1]);
    if (seen.has(n)) continue;
    seen.add(n);
    const at = Date.parse(m[3]);
    out.push({ n, c: m[2] as Classification, at: Number.isNaN(at) ? 0 : at });
  }
  return out;
}

export async function GET(req: NextRequest) {
  try {
    const scope = await requireOwnCompanyScope(req);
    const companyId = scope.companyId;
    const employeeScoped = scope.breadth === "employee";
    const ownEmployeeId = scope.employeeId ?? NIL_EMPLOYEE;

    const now = Date.now();
    const sp = req.nextUrl.searchParams;
    const rangeParam = sp.get("range");
    if (rangeParam !== null && rangeParam !== "today" && rangeParam !== "7d") {
      return formatApiResponse({}, 400, "range must be 'today' or '7d'");
    }
    const range: "today" | "7d" = rangeParam === "today" ? "today" : "7d";
    const todayStartParam = sp.get("todayStart");
    let todayStart: number;
    if (todayStartParam !== null) {
      const parsed = Date.parse(todayStartParam);
      if (Number.isNaN(parsed) || Math.abs(now - parsed) > MAX_TODAY_SKEW_MS) {
        return formatApiResponse({}, 400, "todayStart must be the viewer's local midnight as an ISO timestamp");
      }
      todayStart = parsed;
    } else {
      todayStart = Date.parse(new Date(now).toISOString().slice(0, 10));
    }
    const weekStart = todayStart - (WINDOW_DAYS - 1) * DAY_MS;
    const rangeStart = range === "today" ? todayStart : weekStart;

    // ---- 1) Listen events: one bounded query, narrow columns ----
    let listenQuery = supabaseAdmin
      .from("listen_events")
      .select("event_type, session_id, lead_id, created_at")
      .eq("company_id", companyId)
      .gte("created_at", new Date(weekStart).toISOString())
      .order("created_at", { ascending: false })
      .limit(5000);
    if (employeeScoped) listenQuery = listenQuery.eq("employee_id", ownEmployeeId);
    const listen = await listenQuery;
    const listenStatus: "ok" | "not_applied" | "unavailable" = !listen.error ? "ok" : listen.error.code === "42P01" ? "not_applied" : "unavailable";
    const rows = (listenStatus === "ok" ? (listen.data ?? []) : []) as ListenRow[];

    // ---- 2) Leads with data points: created in/near the window, plus any
    // lead a visit is linked to (at most one extra query) ----
    const leadColumns = "id, name, email, qualification_notes, created_at";
    let leadQuery = supabaseAdmin
      .from("leads")
      .select(leadColumns)
      .eq("company_id", companyId)
      .gte("created_at", new Date(weekStart - DAY_MS).toISOString())
      .order("created_at", { ascending: false })
      .limit(300);
    if (employeeScoped) leadQuery = leadQuery.eq("employee_id", ownEmployeeId);
    const leads = await leadQuery;
    const leadStatus: "ok" | "unavailable" = leads.error ? "unavailable" : "ok";
    const leadRows = new Map<string, LeadRow>();
    for (const l of (leads.data ?? []) as LeadRow[]) leadRows.set(l.id, l);
    const linkedMissing = [...new Set(rows.map((r) => r.lead_id).filter((x): x is string => Boolean(x)))].filter((id) => !leadRows.has(id)).slice(0, 200);
    if (linkedMissing.length > 0) {
      let extra = supabaseAdmin.from("leads").select(leadColumns).eq("company_id", companyId).in("id", linkedMissing);
      if (employeeScoped) extra = extra.eq("employee_id", ownEmployeeId);
      const ex = await extra;
      for (const l of (ex.data ?? []) as LeadRow[]) leadRows.set(l.id, l);
    }

    // ---- 3) Aggregate ----
    const byType = emptyPlays();
    const trendCounts = new Array<number>(WINDOW_DAYS).fill(0);
    const todayUsers = new Set<string>();
    const weekUsers = new Set<string>();
    let todayPlays = 0;
    let weekPlays = 0;
    // A visit is attributed to a lead if ANY of its events carries the link.
    const sessionLead = new Map<string, string>();
    for (const r of rows) if (r.lead_id) sessionLead.set(r.session_id, r.lead_id);
    const userKeyOf = (session: string) => (sessionLead.has(session) ? `lead:${sessionLead.get(session)}` : `visitor:${session}`);
    const users = new Map<string, UserRow>();
    const ensureUser = (key: string, session: string | null): UserRow => {
      let u = users.get(key);
      if (u) return u;
      const leadId = key.startsWith("lead:") ? key.slice(5) : null;
      const identity = leadId ? identityOf(leadRows.get(leadId), leadId) : { label: `Visitor ${shortId(session ?? "")}`, email: null, identified: false };
      u = {
        key,
        label: identity.label,
        kind: leadId ? "lead" : "visitor",
        identified: identity.identified,
        leadId,
        email: identity.email,
        plays: emptyPlays(),
        dataPoints: [null, null, null, null, null, null],
        answered: 0,
        completed: false,
        lastAt: null,
      };
      users.set(key, u);
      return u;
    };

    for (const r of rows) {
      const k = KEY[r.event_type as EventType];
      if (!k) continue;
      const at = Date.parse(r.created_at);
      if (Number.isNaN(at) || at < weekStart) continue;
      const ukey = userKeyOf(r.session_id);
      weekPlays += 1;
      weekUsers.add(ukey);
      if (at >= todayStart) {
        todayPlays += 1;
        todayUsers.add(ukey);
      }
      const dayIdx = Math.floor((at - weekStart) / DAY_MS);
      if (dayIdx >= 0 && dayIdx < WINDOW_DAYS) trendCounts[dayIdx] += 1;
      if (at < rangeStart) continue;
      byType[k] += 1;
      byType.total += 1;
      const u = ensureUser(ukey, r.session_id);
      u.plays[k] += 1;
      u.plays.total += 1;
      if (!u.lastAt || at > Date.parse(u.lastAt)) u.lastAt = r.created_at;
    }

    // Data points: a lead is listed when it answered inside the range or
    // listened inside the range; all its persisted answers are shown.
    for (const l of leadRows.values()) {
      const dps = parseDataPoints(l.qualification_notes);
      const key = `lead:${l.id}`;
      if (!users.has(key) && !dps.some((d) => d.at >= rangeStart)) continue;
      const u = ensureUser(key, null);
      for (const d of dps) u.dataPoints[d.n - 1] = d.c;
      u.answered = dps.length;
      u.completed = dps.length === 6;
      if (!u.lastAt && dps.length > 0) u.lastAt = new Date(Math.max(...dps.map((d) => d.at))).toISOString();
    }

    const userList = [...users.values()]
      .sort((a, b) => b.plays.total - a.plays.total || b.answered - a.answered || Date.parse(b.lastAt ?? "1970-01-01") - Date.parse(a.lastAt ?? "1970-01-01"))
      .slice(0, MAX_USERS);
    // The trend follows the selected range: 7 Days = one bucket per local
    // calendar day (six previous days + today, zero days included); Today =
    // one bucket per local hour from midnight up to the current hour.
    const trendGranularity: "day" | "hour" = range === "today" ? "hour" : "day";
    let trend: Array<{ day: string; plays: number }>;
    if (trendGranularity === "hour") {
      const hours = Math.min(24, Math.max(1, Math.floor((now - todayStart) / HOUR_MS) + 1));
      const hourCounts = new Array<number>(hours).fill(0);
      for (const r of rows) {
        if (!KEY[r.event_type as EventType]) continue;
        const at = Date.parse(r.created_at);
        if (Number.isNaN(at) || at < todayStart) continue;
        const idx = Math.floor((at - todayStart) / HOUR_MS);
        if (idx >= 0 && idx < hours) hourCounts[idx] += 1;
      }
      trend = hourCounts.map((plays, i) => ({ day: new Date(todayStart + i * HOUR_MS).toISOString(), plays }));
    } else {
      trend = trendCounts.map((plays, i) => ({ day: new Date(weekStart + i * DAY_MS).toISOString(), plays }));
    }

    // ---- 4) Appointments (the dashboards' compact summary only) ----
    let apptQuery = supabaseAdmin.from("appointments").select("status, created_at").eq("company_id", companyId).order("created_at", { ascending: false }).limit(5000);
    if (employeeScoped) apptQuery = apptQuery.eq("employee_id", ownEmployeeId);
    const appts = await apptQuery;
    const appointments = { bookedWeek: 0, bookedTotal: 0, requestedTotal: 0 };
    for (const a of (appts.error ? [] : (appts.data ?? [])) as Array<{ status?: string; created_at?: string }>) {
      if (a.status === "BOOKED") {
        appointments.bookedTotal += 1;
        if (a.created_at && Date.parse(a.created_at) >= weekStart) appointments.bookedWeek += 1;
      } else if (a.status === "REQUESTED") {
        appointments.requestedTotal += 1;
      }
    }

    const res = formatApiResponse(
      {
        range,
        windows: { todayStart: new Date(todayStart).toISOString(), weekStart: new Date(weekStart).toISOString(), rangeStart: new Date(rangeStart).toISOString() },
        listenStatus,
        leadStatus,
        telemetryEnabled: listenStatus !== "not_applied",
        totals: { todayUsers: todayUsers.size, weekUsers: weekUsers.size, todayPlays, weekPlays },
        // The selected range's own figures: unique users are de-duplicated
        // across the WHOLE range (never a sum of daily uniques).
        rangeTotals: range === "today" ? { users: todayUsers.size, plays: todayPlays } : { users: weekUsers.size, plays: weekPlays },
        byType,
        trend,
        trendGranularity,
        users: userList,
        usersTotal: users.size,
        appointments,
        definitions: {
          user: "One visitor: a card visit (per-tab session) with at least one genuine play or data-point answer; merged into the lead once they answer.",
          today: "Today = from the viewer's local midnight to now.",
          week: "7 Days = the last 7 local calendar days including today (from local midnight six days ago to now).",
          plays: "Genuine user-initiated plays only — never prefetch, warm-up or page load.",
        },
      },
      200,
      "Listening analytics retrieved"
    );
    // Per-user, session-scoped data: never cacheable by a shared cache.
    res.headers.set("Cache-Control", "private, no-store");
    return res;
  } catch (error) {
    return handleApiError(error);
  }
}
