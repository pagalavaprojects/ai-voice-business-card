/**
 * The booking flow's qualification poll must expose ONLY the routing
 * signal (qualified + parsed answers) — never lead PII — and must be
 * scoped to the caller's own live call id. "Qualified" means genuine
 * completion of all six authoritative questions (question 6 answered),
 * not a lead-scoring byproduct — qualification completion and lead
 * scoring are deliberately separate concerns (2026-08-13 revision).
 */
import { NextRequest } from "next/server";

type Row = Record<string, unknown> | null;
let conversationRow: Row = null;
let leadRow: Row = null;
// Every .eq() filter the route applies, per table — so tests can assert the
// tenant scoping (company/employee/callId) is genuinely on the query, not
// just that a row came back. A mock that swallows filters would keep
// passing even if the route dropped its IDOR guards.
let eqCalls: Array<{ table: string; column: string; value: unknown }> = [];

jest.mock("@/shared/lib/supabase", () => ({
  supabaseAdmin: {
    from: (table: string) => {
      const result = () => Promise.resolve({ data: table === "conversations" ? conversationRow : leadRow });
      const chain: Record<string, unknown> = {};
      const self = () => chain;
      Object.assign(chain, {
        select: self, order: self, limit: self,
        eq: (column: string, value: unknown) => {
          eqCalls.push({ table, column, value });
          return chain;
        },
        maybeSingle: result,
      });
      return chain;
    },
  },
}));

jest.mock("@/shared/lib/rateLimit", () => ({
  checkRateLimitDistributed: jest.fn().mockResolvedValue({ allowed: true }),
}));

import { GET } from "@/app/api/public/[companyId]/[employeeId]/qualification-status/route";

const params = { companyId: "c1", employeeId: "e1" };
const request = (callId?: string) =>
  new NextRequest(`http://localhost/api/public/c1/e1/qualification-status${callId ? `?callId=${callId}` : ""}`);

function notesThrough(n: number): string {
  const lines = [];
  for (let i = 1; i <= n; i++) lines.push(`Q${i} [YES] (2026-08-13T10:0${i}:00.000Z): Yes`);
  return lines.join("\n");
}

describe("qualification-status", () => {
  beforeEach(() => {
    conversationRow = null;
    leadRow = null;
    eqCalls = [];
  });

  it("scopes BOTH lookups to the URL's company and employee — a callId can never read across tenants (IDOR)", async () => {
    conversationRow = { id: "conv-1" };
    leadRow = { qualification_notes: notesThrough(6) };
    await GET(request("call-abc-123"), { params });

    const filters = (table: string) => eqCalls.filter((c) => c.table === table).map((c) => `${c.column}=${String(c.value)}`);
    expect(filters("conversations")).toEqual(
      expect.arrayContaining(["vapi_call_id=call-abc-123", "company_id=c1", "employee_id=e1"])
    );
    // The lead is reached through the already-scoped conversation AND
    // re-scoped by company — belt and braces.
    expect(filters("leads")).toEqual(expect.arrayContaining(["conversation_id=conv-1", "company_id=c1"]));
  });

  it("requires a plausible callId", async () => {
    expect((await GET(request(), { params })).status).toBe(400);
    expect((await GET(request("x"), { params })).status).toBe(400);
  });

  it("reports unqualified while no conversation exists yet for the call", async () => {
    const json = await (await GET(request("call-abc-123"), { params })).json();
    expect(json).toEqual({ qualified: false, answers: [] });
  });

  it("reports unqualified while no answers have been recorded yet", async () => {
    conversationRow = { id: "conv-1" };
    leadRow = { qualification_notes: "" };
    const json = await (await GET(request("call-abc-123"), { params })).json();
    expect(json).toEqual({ qualified: false, answers: [] });
  });

  it.each([1, 2, 3, 4, 5])("reports unqualified while only question %i of 6 has been answered", async (n) => {
    conversationRow = { id: "conv-1" };
    leadRow = { qualification_notes: notesThrough(n) };
    const json = await (await GET(request("call-abc-123"), { params })).json();
    expect(json.qualified).toBe(false);
    expect(json.answers).toHaveLength(n);
  });

  it("reports qualified: true exactly once question 6 has been answered — completion, not a scoring byproduct", async () => {
    conversationRow = { id: "conv-1" };
    leadRow = { qualification_notes: notesThrough(6) };
    const res = await GET(request("call-abc-123"), { params });
    const json = await res.json();
    expect(json.qualified).toBe(true);
    expect(json.answers).toHaveLength(6);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  it("is qualified even when lead_temperature was never set — completion never depends on scoring", async () => {
    conversationRow = { id: "conv-1" };
    leadRow = { lead_temperature: null, qualification_notes: notesThrough(6) };
    const json = await (await GET(request("call-abc-123"), { params })).json();
    expect(json.qualified).toBe(true);
  });

  it("never leaks lead fields beyond the routing signal — no temperature field at all anymore", async () => {
    conversationRow = { id: "conv-1" };
    leadRow = { lead_temperature: "HOT", name: "Private Person", email: "p@x.com", phone: "+91 90000 00000", qualification_notes: notesThrough(6) };
    const json = await (await GET(request("call-abc-123"), { params })).json();
    expect(Object.keys(json).sort()).toEqual(["answers", "qualified"]);
  });

  // Regression guard alongside the 2026-08-13 idempotency fix in
  // get_next_qualification_question (QualificationSequencing.test.ts):
  // that fix stops the SEQUENCING TOOL from ever writing a duplicate Qn
  // line, but this endpoint is a separate, independent read of whatever
  // qualification_notes actually contains. If a duplicate line reached it
  // by any other path (a pre-fix lead, manual data, a future regression
  // elsewhere), the endpoint itself must still not crash and must not let
  // the duplicate flip "qualified" incorrectly.
  it("a duplicate Qn line in notes does not crash the endpoint and does not break qualified detection", async () => {
    conversationRow = { id: "conv-1" };
    leadRow = {
      qualification_notes:
        notesThrough(5) +
        "\nQ6 [YES] (2026-08-13T10:06:00.000Z): Yes" +
        "\nQ6 [YES] (2026-08-13T10:06:05.000Z): Yes", // duplicate Q6 line
    };
    const res = await GET(request("call-abc-123"), { params });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.qualified).toBe(true); // still correctly detects completion
    expect(json.answers.filter((a: { n: number }) => a.n === 6)).toHaveLength(2); // parses both lines honestly rather than silently dropping data
  });

  // Regression guard for the 2026-08-14 fix in update_lead_qualification
  // (VoiceEngine.test.ts): that tool now APPENDS the model's mirrored
  // free-text note as its own line instead of replacing the whole column,
  // so a real lead's notes end up with Qn lines interleaved with plain
  // free-text lines. This endpoint must keep parsing only the structured
  // lines and ignore the free-text ones, exactly as it already does for
  // "internal AI reasoning" lines below.
  it("still parses correctly when Qn lines are interleaved with the model's mirrored free-text notes", async () => {
    conversationRow = { id: "conv-1" };
    leadRow = {
      qualification_notes:
        "Q1 [YES] (2026-08-14T10:00:00.000Z): Yes" +
        "\nQ2 [NO] (2026-08-14T10:01:00.000Z): No" +
        "\nVisitor confirmed perceived usefulness" + // mirrored free-text note, no Qn prefix
        "\nQ3 [MAYBE] (2026-08-14T10:02:00.000Z): Maybe",
    };
    const json = await (await GET(request("call-abc-123"), { params })).json();
    expect(json.qualified).toBe(false);
    expect(json.answers).toEqual([
      { n: 1, c: "YES", a: "Yes" },
      { n: 2, c: "NO", a: "No" },
      { n: 3, c: "MAYBE", a: "Maybe" },
    ]);
    expect(JSON.stringify(json)).not.toContain("perceived usefulness");
  });

  it("parses the recorded answers out of qualification_notes and exposes ONLY the structured lines", async () => {
    conversationRow = { id: "conv-1" };
    leadRow = {
      qualification_notes: [
        "internal AI reasoning line that must never leak",
        "Q1 [YES] (2026-08-13T10:00:00.000Z): They need it immediately.",
        "Q2 [MAYBE] (2026-08-13T10:01:00.000Z): Some budget set aside.",
      ].join("\n"),
    };
    const json = await (await GET(request("call-abc-123"), { params })).json();
    expect(json.answers).toEqual([
      { n: 1, c: "YES", a: "They need it immediately." },
      { n: 2, c: "MAYBE", a: "Some budget set aside." },
    ]);
    expect(JSON.stringify(json)).not.toContain("internal AI reasoning");
  });
});
