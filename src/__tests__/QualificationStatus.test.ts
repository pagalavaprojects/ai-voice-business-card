/**
 * The booking flow's qualification poll must expose ONLY the routing
 * signal (qualified + temperature bucket) — never lead PII — and must be
 * scoped to the caller's own live call id.
 */
import { NextRequest } from "next/server";

type Row = Record<string, unknown> | null;
let conversationRow: Row = null;
let leadRow: Row = null;

jest.mock("@/shared/lib/supabase", () => ({
  supabaseAdmin: {
    from: (table: string) => {
      const result = () => Promise.resolve({ data: table === "conversations" ? conversationRow : leadRow });
      const chain: Record<string, unknown> = {};
      const self = () => chain;
      Object.assign(chain, {
        select: self, eq: self, order: self, limit: self,
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

describe("qualification-status", () => {
  beforeEach(() => {
    conversationRow = null;
    leadRow = null;
  });

  it("requires a plausible callId", async () => {
    expect((await GET(request(), { params })).status).toBe(400);
    expect((await GET(request("x"), { params })).status).toBe(400);
  });

  it("reports unqualified while no conversation exists yet for the call", async () => {
    const json = await (await GET(request("call-abc-123"), { params })).json();
    expect(json).toEqual({ qualified: false, temperature: null });
  });

  it("reports unqualified while the lead has no temperature yet", async () => {
    conversationRow = { id: "conv-1" };
    leadRow = { lead_temperature: null };
    const json = await (await GET(request("call-abc-123"), { params })).json();
    expect(json).toEqual({ qualified: false, temperature: null });
  });

  it.each(["HOT", "WARM", "COLD"] as const)("reports %s once the engine has classified the lead", async (temp) => {
    conversationRow = { id: "conv-1" };
    leadRow = { lead_temperature: temp };
    const res = await GET(request("call-abc-123"), { params });
    const json = await res.json();
    expect(json).toEqual({ qualified: true, temperature: temp });
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  it("never leaks lead fields beyond the routing signal", async () => {
    conversationRow = { id: "conv-1" };
    leadRow = { lead_temperature: "HOT", name: "Private Person", email: "p@x.com", phone: "+91 90000 00000" };
    const json = await (await GET(request("call-abc-123"), { params })).json();
    expect(Object.keys(json).sort()).toEqual(["qualified", "temperature"]);
  });
});
