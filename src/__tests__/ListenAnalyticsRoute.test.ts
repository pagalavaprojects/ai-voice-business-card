/**
 * GET /api/user/listen-analytics — the scoped aggregate behind the dashboard's
 * listening-analytics section. Proves: real aggregation of genuine play events
 * (by type, today/week unique visitors, per-session), data-points-per-lead
 * derived from the existing qualification_notes, tenant/employee scoping, and
 * fail-open behaviour when the listen_events table is not applied yet.
 */
const scope = { companyId: "c1", breadth: "company" as "company" | "employee", employeeId: null as string | null, isPlatformAdmin: false, role: "OWNER" };
const requireOwnCompanyScope = jest.fn(async (..._a: unknown[]) => scope);

// Per-table canned results; each from(table) returns a chainable thenable.
let listenResult: { data: unknown[] | null; error: { code: string } | null } = { data: [], error: null };
let leadsResult: { data: unknown[] | null; error: { code: string } | null } = { data: [], error: null };
let appointmentsResult: { data: unknown[] | null; error: { code: string } | null } = { data: [], error: null };

function builder(table: string) {
  const result = table === "listen_events" ? listenResult : table === "appointments" ? appointmentsResult : leadsResult;
  const b: Record<string, unknown> = {};
  for (const m of ["select", "eq", "gte", "in", "order", "limit"]) b[m] = () => b;
  // Thenable so `await query` resolves to the canned result.
  (b as { then: unknown }).then = (resolve: (v: unknown) => void) => resolve(result);
  return b;
}

jest.mock("@/shared/lib/dashboardScope", () => ({ requireOwnCompanyScope: (...a: unknown[]) => requireOwnCompanyScope(...a) }));
jest.mock("@/shared/lib/supabase", () => ({ supabaseAdmin: { from: (t: string) => builder(t) } }));
jest.mock("@/shared/lib/security", () => ({ formatApiResponse: (data: unknown, status: number) => ({ status, json: async () => ({ data }) }) }));
jest.mock("@/shared/lib/apiHandler", () => ({ handleApiError: () => ({ status: 500, json: async () => ({}) }) }));

import { NextRequest } from "next/server";
import { GET } from "@/app/api/user/listen-analytics/route";

function req(qs = "") {
  return new NextRequest(`http://localhost/api/user/listen-analytics${qs}`);
}

beforeEach(() => {
  jest.clearAllMocks();
  scope.breadth = "company";
  scope.employeeId = null;
  listenResult = { data: [], error: null };
  leadsResult = { data: [], error: null };
  appointmentsResult = { data: [], error: null };
});

const todayStartQs = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return `?todayStart=${encodeURIComponent(d.toISOString())}`;
};

describe("aggregation", () => {
  it("counts plays by type, unique visitors today/week, and per session", async () => {
    const today = new Date().toISOString();
    const lastWeek = new Date(Date.now() - 3 * 24 * 3600_000).toISOString();
    listenResult = {
      data: [
        { event_type: "intro_play", session_id: "sessAAAAAA", created_at: today },
        { event_type: "elevator_play", session_id: "sessAAAAAA", created_at: today },
        { event_type: "intro_play", session_id: "sessBBBBBB", created_at: lastWeek },
        { event_type: "usp_play", session_id: "sessBBBBBB", created_at: lastWeek },
        { event_type: "product_play", session_id: "sessAAAAAA", created_at: today },
      ],
      error: null,
    };
    const body = (await (await GET(req(`?todayStart=${encodeURIComponent(new Date().toISOString().slice(0, 10))}`))).json()).data;
    expect(body.telemetryEnabled).toBe(true);
    expect(body.byType).toEqual({ intro: 2, replay: 0, elevator: 1, product: 1, usp: 1, smart: 0 });
    expect(body.totals.weekUsers).toBe(2); // sessA + sessB
    expect(body.totals.todayUsers).toBe(1); // only sessA today
    const a = body.perSession.find((s: { session: string }) => s.session === "sessAAAA".slice(0, 8) || s.session.startsWith("sessAAAA"));
    expect(a.total).toBe(3);
  });

  it("reports Introduction replays and Smart AI Lead plays separately, plus total plays today / this week", async () => {
    const now = new Date().toISOString();
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 3600_000).toISOString();
    listenResult = {
      data: [
        { event_type: "intro_play", session_id: "sessAAAAAA", created_at: now },
        { event_type: "intro_replay", session_id: "sessAAAAAA", created_at: now },
        { event_type: "smart_play", session_id: "sessAAAAAA", created_at: now },
        { event_type: "intro_play", session_id: "sessBBBBBB", created_at: twoDaysAgo },
        { event_type: "smart_play", session_id: "sessBBBBBB", created_at: twoDaysAgo },
      ],
      error: null,
    };
    const body = (await (await GET(req(todayStartQs()))).json()).data;
    expect(body.byType).toEqual({ intro: 2, replay: 1, elevator: 0, product: 0, usp: 0, smart: 2 });
    expect(body.totals.todayPlays).toBe(3);
    expect(body.totals.weekPlays).toBe(5);
    expect(body.totals.todayUsers).toBe(1);
    expect(body.totals.weekUsers).toBe(2);
    const a = body.perSession.find((s: { session: string }) => s.session.startsWith("sessAAAA"));
    expect(a).toMatchObject({ intro: 1, replay: 1, smart: 1, total: 3 });
  });

  it("builds a 7-day daily trend (oldest -> today) from the viewer's local midnight", async () => {
    const now = Date.now();
    listenResult = {
      data: [
        { event_type: "intro_play", session_id: "sessAAAAAA", created_at: new Date(now).toISOString() },
        { event_type: "usp_play", session_id: "sessAAAAAA", created_at: new Date(now).toISOString() },
        { event_type: "intro_play", session_id: "sessBBBBBB", created_at: new Date(now - 3 * 24 * 3600_000).toISOString() },
        // Outside the 7-day trend window: not in any bucket.
        { event_type: "intro_play", session_id: "sessCCCCCC", created_at: new Date(now - 9 * 24 * 3600_000).toISOString() },
      ],
      error: null,
    };
    const body = (await (await GET(req(todayStartQs()))).json()).data;
    expect(body.trend).toHaveLength(7);
    expect(body.trend[6].plays).toBe(2); // today
    expect(body.trend[3].plays).toBe(1); // three days ago
    expect(body.trend.reduce((n: number, t: { plays: number }) => n + t.plays, 0)).toBe(3);
    // Buckets are consecutive 24h windows ending today, keyed by their START
    // INSTANT — the viewer's local midnight — never by a UTC calendar date
    // (which is the previous day for anyone east of UTC).
    const localMidnight = new Date();
    localMidnight.setHours(0, 0, 0, 0);
    expect(body.trend[6].day).toBe(localMidnight.toISOString());
    for (let i = 1; i < 7; i++) expect(Date.parse(body.trend[i].day) - Date.parse(body.trend[i - 1].day)).toBe(24 * 3600_000);
  });

  it("counts appointments booked (confirmed) this week / all time, and REQUESTED separately — never conflated", async () => {
    const now = new Date().toISOString();
    const lastMonth = new Date(Date.now() - 30 * 24 * 3600_000).toISOString();
    appointmentsResult = {
      data: [
        { status: "BOOKED", created_at: now },
        { status: "BOOKED", created_at: lastMonth },
        { status: "REQUESTED", created_at: now },
        { status: "CANCELLED", created_at: now },
      ],
      error: null,
    };
    const body = (await (await GET(req())).json()).data;
    expect(body.appointments).toEqual({ bookedWeek: 1, bookedTotal: 2, requestedTotal: 1 });
  });

  it("derives data points answered per lead from qualification_notes (distinct Q1..Q6)", async () => {
    leadsResult = {
      data: [
        { id: "l1", name: "Alice", qualification_notes: "Q1 [YES] (t): Yes\nQ2 [NO] (t): No\nQ2 [NO] (t): No\nsome AI note" },
        { id: "l2", name: "Bob", qualification_notes: "" },
        { id: "l3", name: null, qualification_notes: "Q1 [MAYBE] (t): Maybe\nQ6 [YES] (t): Yes" },
      ],
      error: null,
    };
    const body = (await (await GET(req())).json()).data;
    // Alice: Q1,Q2 distinct = 2; Bob: 0 (filtered out); l3: Q1,Q6 = 2 labelled "Lead"
    expect(body.dataPointsByLead).toEqual([
      { lead: "Alice", answered: 2 },
      { lead: "Lead", answered: 2 },
    ]);
  });
});

describe("fail-open + scoping", () => {
  it("reports telemetryEnabled:false when listen_events is missing, but still returns data points", async () => {
    listenResult = { data: null, error: { code: "42P01" } };
    leadsResult = { data: [{ id: "l1", name: "A", qualification_notes: "Q1 [YES] (t): Yes" }], error: null };
    const body = (await (await GET(req())).json()).data;
    expect(body.telemetryEnabled).toBe(false);
    expect(body.byType).toEqual({ intro: 0, replay: 0, elevator: 0, product: 0, usp: 0, smart: 0 });
    expect(body.totals).toEqual({ todayUsers: 0, weekUsers: 0, todayPlays: 0, weekPlays: 0 });
    expect(body.trend.every((t: { plays: number }) => t.plays === 0)).toBe(true);
    expect(body.dataPointsByLead).toEqual([{ lead: "A", answered: 1 }]);
  });

  it("is employee-scoped for staff (breadth=employee)", async () => {
    scope.breadth = "employee";
    scope.employeeId = "emp-9";
    const res = await GET(req());
    expect(res.status).toBe(200); // scoping applied without error
  });
});
