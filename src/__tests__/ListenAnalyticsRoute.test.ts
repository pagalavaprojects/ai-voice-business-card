/**
 * GET /api/user/listen-analytics — the ONE request behind the Item 14 page.
 * Proves: per-user listening per clip (with replay + Smart AI Lead distinct),
 * unique listeners today / 7 local days, the local-midnight trend, per-user
 * DP1–DP6 from the persisted qualification record, the lead⇄visit merge,
 * honest status (empty vs not applied vs unavailable), parameter validation,
 * and that scope comes from the session — never from a crafted parameter.
 */
const scope = { companyId: "c1", breadth: "company" as "company" | "employee", employeeId: null as string | null, isPlatformAdmin: false, role: "OWNER" };
const requireOwnCompanyScope = jest.fn(async (..._a: unknown[]) => scope);

type Result = { data: unknown[] | null; error: { code: string } | null };
let listenResult: Result = { data: [], error: null };
let leadsResult: Result = { data: [], error: null };
let leadsByIdResult: Result = { data: [], error: null };
let appointmentsResult: Result = { data: [], error: null };
/** Every filter applied per table, so tests can assert the scope used. */
const filters: Record<string, Array<[string, string, unknown]>> = {};

function builder(table: string) {
  const b: Record<string, unknown> = {};
  let byId = false;
  for (const m of ["select", "order", "limit"]) b[m] = () => b;
  b.eq = (col: string, v: unknown) => {
    (filters[table] ??= []).push(["eq", col, v]);
    return b;
  };
  b.gte = (col: string, v: unknown) => {
    (filters[table] ??= []).push(["gte", col, v]);
    return b;
  };
  b.in = (col: string, v: unknown) => {
    byId = true;
    (filters[table] ??= []).push(["in", col, v]);
    return b;
  };
  (b as { then: unknown }).then = (resolve: (v: unknown) => void) =>
    resolve(table === "listen_events" ? listenResult : table === "appointments" ? appointmentsResult : byId ? leadsByIdResult : leadsResult);
  return b;
}

jest.mock("@/shared/lib/dashboardScope", () => ({ requireOwnCompanyScope: (...a: unknown[]) => requireOwnCompanyScope(...a) }));
jest.mock("@/shared/lib/supabase", () => ({ supabaseAdmin: { from: (t: string) => builder(t) } }));
jest.mock("@/shared/lib/security", () => ({ formatApiResponse: (data: unknown, status: number, message: string) => ({ status, json: async () => ({ data, message }) }) }));
jest.mock("@/shared/lib/apiHandler", () => ({ handleApiError: () => ({ status: 500, json: async () => ({}) }) }));

import { NextRequest } from "next/server";
import { GET } from "@/app/api/user/listen-analytics/route";

const DAY = 24 * 3600_000;
const localMidnight = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};
const qs = (extra = "") => `?todayStart=${encodeURIComponent(localMidnight().toISOString())}${extra}`;
const req = (q = qs()) => new NextRequest(`http://localhost/api/user/listen-analytics${q}`);
const body = async (q?: string) => (await (await GET(req(q))).json()).data;
const iso = (msAgo: number) => new Date(Date.now() - msAgo).toISOString();
const dp = (n: number, c: string, at: string) => `Q${n} [${c}] (${at}): ${c}`;

beforeEach(() => {
  jest.clearAllMocks();
  scope.breadth = "company";
  scope.employeeId = null;
  listenResult = { data: [], error: null };
  leadsResult = { data: [], error: null };
  leadsByIdResult = { data: [], error: null };
  appointmentsResult = { data: [], error: null };
  for (const k of Object.keys(filters)) delete filters[k];
});

describe("per-user listening + data points", () => {
  it("aggregates each user's plays per clip, merges a visit into its lead, and shows persisted DP1–DP6", async () => {
    const now = iso(0);
    listenResult = {
      data: [
        { event_type: "intro_play", session_id: "sessAAAAAA", lead_id: null, created_at: now },
        { event_type: "intro_replay", session_id: "sessAAAAAA", lead_id: "lead-1", created_at: now },
        { event_type: "elevator_play", session_id: "sessAAAAAA", lead_id: "lead-1", created_at: now },
        { event_type: "smart_play", session_id: "sessAAAAAA", lead_id: null, created_at: now },
        { event_type: "usp_play", session_id: "sessBBBBBB", lead_id: null, created_at: now },
        { event_type: "product_play", session_id: "sessBBBBBB", lead_id: null, created_at: now },
      ],
      error: null,
    };
    leadsResult = {
      data: [{ id: "lead-1", name: "Asha", email: "asha@example.com", qualification_notes: [dp(1, "YES", now), dp(2, "NO", now), dp(3, "MAYBE", now)].join("\n"), created_at: now }],
      error: null,
    };
    const d = await body();
    expect(d.listenStatus).toBe("ok");
    const asha = d.users.find((u: { key: string }) => u.key === "lead:lead-1");
    expect(asha).toMatchObject({ label: "Asha", kind: "lead", identified: true, email: "asha@example.com", answered: 3, completed: false });
    expect(asha.plays).toEqual({ intro: 1, replay: 1, elevator: 1, product: 0, usp: 0, smart: 1, total: 4 });
    expect(asha.dataPoints).toEqual(["YES", "NO", "MAYBE", null, null, null]);
    const visitor = d.users.find((u: { key: string }) => u.key === "visitor:sessBBBBBB");
    expect(visitor).toMatchObject({ label: "Visitor sessBBBB", kind: "visitor", identified: false, answered: 0 });
    expect(visitor.plays).toMatchObject({ usp: 1, product: 1, total: 2 });
    // Two users, not three: the linked visit and its lead are ONE user.
    expect(d.users).toHaveLength(2);
    expect(d.totals.todayUsers).toBe(2);
  });

  it("labels a placeholder lead (qualification tool's 'Voice qualification visitor' + internal address) as an unidentified 'Lead <id>', never as a named person", async () => {
    const now = iso(0);
    listenResult = { data: [{ event_type: "usp_play", session_id: "sessQQQQQQ", lead_id: "abcdef12-0000-0000-0000-000000000000", created_at: now }], error: null };
    leadsResult = {
      data: [{ id: "abcdef12-0000-0000-0000-000000000000", name: "Voice qualification visitor", email: "qualifying-x@placeholder.maylaanai.internal", qualification_notes: dp(1, "YES", now), created_at: now }],
      error: null,
    };
    const d = await body();
    expect(d.users).toHaveLength(1);
    expect(d.users[0]).toMatchObject({ label: "Lead abcdef12", kind: "lead", identified: false, email: null, answered: 1 });
    expect(d.users[0].plays.usp).toBe(1);
  });

  it("keeps long custom visit ids distinguishable in the visitor label", async () => {
    const now = iso(0);
    listenResult = {
      data: [
        { event_type: "intro_play", session_id: "zle-post-deploy-1788800000", lead_id: null, created_at: now },
        { event_type: "intro_play", session_id: "zle-post-deploy-1788800999", lead_id: null, created_at: now },
      ],
      error: null,
    };
    const d = await body();
    const labels = d.users.map((u: { label: string }) => u.label);
    expect(new Set(labels).size).toBe(2);
    expect(labels).toEqual(expect.arrayContaining(["Visitor zle-post…0000", "Visitor zle-post…0999"]));
  });

  it("lists a lead that answered data points but never listened, with 0 plays and 6/6 completion", async () => {
    const t = iso(3600_000);
    leadsResult = {
      data: [{ id: "lead-2", name: "Ravi", email: null, qualification_notes: [1, 2, 3, 4, 5, 6].map((n) => dp(n, n % 2 ? "YES" : "NO", t)).join("\n"), created_at: t }],
      error: null,
    };
    const d = await body();
    const ravi = d.users.find((u: { key: string }) => u.key === "lead:lead-2");
    expect(ravi.plays.total).toBe(0);
    expect(ravi.dataPoints).toEqual(["YES", "NO", "YES", "NO", "YES", "NO"]);
    expect(ravi).toMatchObject({ answered: 6, completed: true });
  });

  it("uses the FIRST persisted record per data point and ignores anything outside DP1–DP6 or malformed", async () => {
    const t = iso(60_000);
    leadsResult = {
      data: [{ id: "l", name: "A", email: null, qualification_notes: [dp(1, "YES", t), dp(1, "NO", t), `Q7 [YES] (${t}): Yes`, "Q2 answered maybe", "Lead score: HOT"].join("\n"), created_at: t }],
      error: null,
    };
    const d = await body();
    const a = d.users.find((u: { key: string }) => u.key === "lead:l");
    expect(a.dataPoints).toEqual(["YES", null, null, null, null, null]);
    expect(a.answered).toBe(1);
  });

  it("fetches a linked lead that is outside the recent-leads window with ONE extra query (no N+1)", async () => {
    listenResult = { data: [{ event_type: "intro_play", session_id: "sessCCCCCC", lead_id: "lead-old", created_at: iso(0) }], error: null };
    leadsByIdResult = { data: [{ id: "lead-old", name: "Old Lead", email: null, qualification_notes: dp(1, "MAYBE", iso(30 * DAY)), created_at: iso(30 * DAY) }], error: null };
    const d = await body();
    const u = d.users.find((x: { key: string }) => x.key === "lead:lead-old");
    expect(u.label).toBe("Old Lead");
    expect(u.plays.intro).toBe(1);
    expect(filters.leads.filter((f) => f[0] === "in")).toHaveLength(1);
  });
});

describe("unique listeners + local time windows", () => {
  it("counts unique users today vs the last 7 local days, excluding anything older", async () => {
    const midnight = localMidnight().getTime();
    listenResult = {
      data: [
        { event_type: "intro_play", session_id: "s-today", lead_id: null, created_at: new Date(midnight + 30 * 60_000).toISOString() }, // 00:30 local today
        { event_type: "intro_play", session_id: "s-today", lead_id: null, created_at: new Date(midnight + 90 * 60_000).toISOString() }, // same user again
        { event_type: "usp_play", session_id: "s-yday", lead_id: null, created_at: new Date(midnight - 30 * 60_000).toISOString() }, // 23:30 local yesterday
        { event_type: "usp_play", session_id: "s-old", lead_id: null, created_at: new Date(midnight - 8 * DAY).toISOString() }, // outside the 7-day window
      ],
      error: null,
    };
    const d = await body();
    expect(d.totals).toEqual({ todayUsers: 1, weekUsers: 2, todayPlays: 2, weekPlays: 3 });
    expect(d.windows.todayStart).toBe(new Date(midnight).toISOString());
    expect(d.windows.weekStart).toBe(new Date(midnight - 6 * DAY).toISOString());
  });

  it("buckets the 7-day trend by local calendar day, keyed by the bucket's start instant", async () => {
    const midnight = localMidnight().getTime();
    listenResult = {
      data: [
        { event_type: "intro_play", session_id: "a", lead_id: null, created_at: new Date(midnight + 5 * 60_000).toISOString() },
        { event_type: "intro_play", session_id: "b", lead_id: null, created_at: new Date(midnight - 5 * 60_000).toISOString() },
        { event_type: "intro_play", session_id: "c", lead_id: null, created_at: new Date(midnight - 3 * DAY + 3600_000).toISOString() },
      ],
      error: null,
    };
    const d = await body();
    expect(d.trend).toHaveLength(7);
    expect(d.trend[6]).toEqual({ day: new Date(midnight).toISOString(), plays: 1 });
    expect(d.trend[5].plays).toBe(1);
    expect(d.trend[3].plays).toBe(1);
    for (let i = 1; i < 7; i++) expect(Date.parse(d.trend[i].day) - Date.parse(d.trend[i - 1].day)).toBe(DAY);
  });

  it("range=today restricts per-clip and per-user figures to today; 7d includes the rest of the window", async () => {
    const midnight = localMidnight().getTime();
    listenResult = {
      data: [
        { event_type: "smart_play", session_id: "s1", lead_id: null, created_at: new Date(midnight + 60_000).toISOString() },
        { event_type: "elevator_play", session_id: "s2", lead_id: null, created_at: new Date(midnight - 2 * DAY).toISOString() },
      ],
      error: null,
    };
    const today = await body(qs("&range=today"));
    expect(today.range).toBe("today");
    expect(today.byType).toMatchObject({ smart: 1, elevator: 0, total: 1 });
    expect(today.users.map((u: { key: string }) => u.key)).toEqual(["visitor:s1"]);
    const week = await body(qs("&range=7d"));
    expect(week.byType).toMatchObject({ smart: 1, elevator: 1, total: 2 });
    expect(week.users).toHaveLength(2);
    // Unique-listener tiles are always both windows, whatever the range.
    expect(today.totals).toEqual(week.totals);
  });
});

describe("honest status + validation", () => {
  it("reports not_applied when the table is missing (42P01) and still returns data points", async () => {
    listenResult = { data: null, error: { code: "42P01" } };
    leadsResult = { data: [{ id: "l1", name: "A", email: null, qualification_notes: dp(1, "YES", iso(0)), created_at: iso(0) }], error: null };
    const d = await body();
    expect(d.listenStatus).toBe("not_applied");
    expect(d.telemetryEnabled).toBe(false);
    expect(d.users[0]).toMatchObject({ label: "A", answered: 1 });
  });

  it("reports unavailable (not zeros) on any other listen query error", async () => {
    listenResult = { data: null, error: { code: "57014" } };
    const d = await body();
    expect(d.listenStatus).toBe("unavailable");
    expect(d.telemetryEnabled).toBe(true);
  });

  it("reports an empty dataset as ok with no users", async () => {
    const d = await body();
    expect(d.listenStatus).toBe("ok");
    expect(d.users).toEqual([]);
    expect(d.totals).toEqual({ todayUsers: 0, weekUsers: 0, todayPlays: 0, weekPlays: 0 });
  });

  it("400s an invalid range, a malformed todayStart, or a todayStart that is not today", async () => {
    expect((await GET(req(qs("&range=month")))).status).toBe(400);
    expect((await GET(req("?todayStart=not-a-date"))).status).toBe(400);
    expect((await GET(req(`?todayStart=${encodeURIComponent(new Date(Date.now() - 10 * DAY).toISOString())}`))).status).toBe(400);
    expect((await GET(req(qs("&range=today")))).status).toBe(200);
  });
});

describe("authorization scope comes from the session, never from a parameter", () => {
  it("scopes every query to the session's company even when companyId / employeeId / userId / scope are crafted", async () => {
    await body(qs("&companyId=other-co&employeeId=zzz&userId=u2&scope=platform"));
    for (const table of ["listen_events", "leads", "appointments"]) {
      const companyEq = filters[table].filter((f) => f[0] === "eq" && f[1] === "company_id").map((f) => f[2]);
      expect(companyEq).toEqual(["c1"]);
      expect(filters[table].some((f) => f[2] === "other-co" || f[2] === "zzz")).toBe(false);
    }
  });

  it("adds the employee filter for staff (breadth=employee) on listen events, leads and appointments", async () => {
    scope.breadth = "employee";
    scope.employeeId = "emp-9";
    await body();
    for (const table of ["listen_events", "leads", "appointments"]) {
      expect(filters[table].some((f) => f[0] === "eq" && f[1] === "employee_id" && f[2] === "emp-9")).toBe(true);
    }
  });

  it("propagates an authorization failure as an error response (never partial data)", async () => {
    requireOwnCompanyScope.mockRejectedValueOnce(new Error("Unauthorized"));
    expect((await GET(req())).status).toBe(500); // handleApiError mock; the real handler maps to 401/403
  });
});

describe("range contract — Today | 7 Days (viewer's local calendar days)", () => {
  const HOUR = 3600_000;
  const m = () => localMidnight().getTime();

  it("Today = local midnight → now: hourly trend buckets up to the current hour, KPIs for today only", async () => {
    const now = Date.now();
    const currentHour = Math.floor((now - m()) / HOUR);
    listenResult = {
      data: [
        { event_type: "intro_play", session_id: "s1", lead_id: null, created_at: new Date(m() + 5 * 60_000).toISOString() }, // 00:05 local
        { event_type: "usp_play", session_id: "s2", lead_id: null, created_at: new Date(now - 60_000).toISOString() }, // a minute ago
        { event_type: "usp_play", session_id: "s3", lead_id: null, created_at: new Date(m() - 60_000).toISOString() }, // yesterday 23:59 local — not today
      ],
      error: null,
    };
    const d = await body(qs("&range=today"));
    expect(d.range).toBe("today");
    expect(d.windows.rangeStart).toBe(new Date(m()).toISOString());
    expect(d.trendGranularity).toBe("hour");
    expect(d.trend).toHaveLength(currentHour + 1);
    expect(d.trend[0]).toEqual({ day: new Date(m()).toISOString(), plays: 1 });
    expect(d.trend[currentHour].plays).toBe(1);
    expect(d.rangeTotals).toEqual({ users: 2, plays: 2 });
    expect(d.users.map((u: { key: string }) => u.key).sort()).toEqual(["visitor:s1", "visitor:s2"]);
  });

  it("7 Days = local midnight six days ago → now: seven daily buckets (zero days kept), today last", async () => {
    listenResult = {
      data: [
        { event_type: "intro_play", session_id: "a", lead_id: null, created_at: new Date(m() - 6 * DAY + 60_000).toISOString() }, // 00:01 six days ago — first bucket
        { event_type: "intro_play", session_id: "b", lead_id: null, created_at: new Date(m() - 6 * DAY - 60_000).toISOString() }, // 23:59 seven days ago — outside
        { event_type: "usp_play", session_id: "c", lead_id: null, created_at: new Date(m() + 60_000).toISOString() }, // today
      ],
      error: null,
    };
    const d = await body(qs("&range=7d"));
    expect(d.windows.rangeStart).toBe(new Date(m() - 6 * DAY).toISOString());
    expect(d.trendGranularity).toBe("day");
    expect(d.trend.map((t: { plays: number }) => t.plays)).toEqual([1, 0, 0, 0, 0, 0, 1]);
    expect(d.trend[0].day).toBe(new Date(m() - 6 * DAY).toISOString());
    expect(d.trend[6].day).toBe(new Date(m()).toISOString());
    expect(d.rangeTotals).toEqual({ users: 2, plays: 2 });
  });

  it("7-day unique users are de-duplicated across the whole range — the same user on three days counts once; per-user totals sum across the days", async () => {
    const rows = [0, 2, 5].map((daysAgo) => ({ event_type: "elevator_play", session_id: "same-user", lead_id: null, created_at: new Date(m() - daysAgo * DAY + 3600_000).toISOString() }));
    rows.push({ event_type: "intro_play", session_id: "other", lead_id: null, created_at: new Date(m() - 4 * DAY + 3600_000).toISOString() });
    listenResult = { data: rows, error: null };
    const d = await body(qs("&range=7d"));
    expect(d.rangeTotals).toEqual({ users: 2, plays: 4 }); // NOT 3 + 1 daily uniques
    expect(d.totals.weekUsers).toBe(2);
    expect(d.totals.todayUsers).toBe(1);
    const same = d.users.find((u: { key: string }) => u.key === "visitor:same-user");
    expect(same.plays).toMatchObject({ elevator: 3, total: 3 });
    // Today: the same user counts once, with only today's play.
    const t = await body(qs("&range=today"));
    expect(t.rangeTotals).toEqual({ users: 1, plays: 1 });
    expect(t.users.find((u: { key: string }) => u.key === "visitor:same-user").plays.total).toBe(1);
  });

  it("a lead's data points stay attributed by range: listed for 7 Days, absent for Today when its answers are older than today", async () => {
    const threeDaysAgo = new Date(m() - 3 * DAY + 3600_000).toISOString();
    leadsResult = { data: [{ id: "lead-old", name: "Old", email: "old@example.com", qualification_notes: [dp(1, "YES", threeDaysAgo), dp(2, "NO", threeDaysAgo)].join("\n"), created_at: threeDaysAgo }], error: null };
    const week = await body(qs("&range=7d"));
    expect(week.users.find((u: { key: string }) => u.key === "lead:lead-old")).toMatchObject({ answered: 2, dataPoints: ["YES", "NO", null, null, null, null] });
    const today = await body(qs("&range=today"));
    expect(today.users.find((u: { key: string }) => u.key === "lead:lead-old")).toBeUndefined();
  });

  it("a missing range means 7 Days; a far-future todayStart is rejected", async () => {
    const d = await body(qs());
    expect(d.range).toBe("7d");
    expect((await GET(req(`?todayStart=${encodeURIComponent(new Date(Date.now() + 3 * DAY).toISOString())}`))).status).toBe(400);
  });
});
