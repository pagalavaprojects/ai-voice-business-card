/**
 * POST /api/public/{companyId}/{employeeId}/listen — records a GENUINE
 * user-initiated card play for the per-user listening analytics. Validates the
 * canonical event model, dedups by client event id (upsert ignoreDuplicates),
 * and is FAIL-OPEN: a missing table (pending apply) or any DB error degrades to
 * a silent no-op, never a 500 on the public card.
 */
const checkRateLimitDistributed = jest.fn(async (..._a: unknown[]) => ({ allowed: true }));
const upsert = jest.fn(async (..._a: unknown[]): Promise<{ error: { code: string; message: string } | null }> => ({ error: null }));

jest.mock("@/shared/lib/supabase", () => ({
  supabaseAdmin: { from: () => ({ upsert: (...a: unknown[]) => upsert(...a) }) },
}));
jest.mock("@/shared/lib/rateLimit", () => ({ checkRateLimitDistributed: (...a: unknown[]) => checkRateLimitDistributed(...a) }));

import { NextRequest } from "next/server";
import { POST } from "@/app/api/public/[companyId]/[employeeId]/listen/route";

const PARAMS = { params: { companyId: "c1", employeeId: "e1" } };
function post(body: unknown) {
  return new NextRequest("http://localhost/api/public/c1/e1/listen", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
const good = { sessionId: "visit-session-1234", eventId: "evt-abcdef12", eventType: "intro_play" };

beforeEach(() => {
  jest.clearAllMocks();
  checkRateLimitDistributed.mockResolvedValue({ allowed: true });
  upsert.mockResolvedValue({ error: null });
});

describe("validation + canonical event model", () => {
  it("accepts a valid intro_play and upserts it deduped by event id", async () => {
    const res = await POST(post(good), PARAMS);
    expect(res.status).toBe(200);
    expect((await res.json()).recorded).toBe(true);
    const [row, opts] = upsert.mock.calls[0] as [Record<string, unknown>, Record<string, unknown>];
    expect(row).toMatchObject({ event_id: "evt-abcdef12", company_id: "c1", employee_id: "e1", session_id: "visit-session-1234", event_type: "intro_play" });
    expect(opts).toMatchObject({ onConflict: "event_id", ignoreDuplicates: true });
  });

  it.each(["elevator_play", "product_play", "usp_play"])("accepts %s", async (eventType) => {
    expect((await POST(post({ ...good, eventType }), PARAMS)).status).toBe(200);
  });

  it("rejects an unknown event type (no arbitrary events)", async () => {
    expect((await POST(post({ ...good, eventType: "smart_play" }), PARAMS)).status).toBe(400);
    expect((await POST(post({ ...good, eventType: "hack" }), PARAMS)).status).toBe(400);
    expect(upsert).not.toHaveBeenCalled();
  });

  it("rejects a too-short session id or event id", async () => {
    expect((await POST(post({ ...good, sessionId: "x" }), PARAMS)).status).toBe(400);
    expect((await POST(post({ ...good, eventId: "x" }), PARAMS)).status).toBe(400);
  });

  it("429s when rate limited", async () => {
    checkRateLimitDistributed.mockResolvedValueOnce({ allowed: false });
    expect((await POST(post(good), PARAMS)).status).toBe(429);
  });
});

describe("fail-open resilience", () => {
  it("returns 200 recorded:false when the table is not applied yet (42P01), never 500", async () => {
    upsert.mockResolvedValueOnce({ error: { code: "42P01", message: "relation \"listen_events\" does not exist" } });
    const res = await POST(post(good), PARAMS);
    expect(res.status).toBe(200);
    expect((await res.json()).recorded).toBe(false);
  });

  it("returns 200 (no-op) on an unexpected DB error rather than surfacing it", async () => {
    upsert.mockResolvedValueOnce({ error: { code: "XX000", message: "boom" } });
    const res = await POST(post(good), PARAMS);
    expect(res.status).toBe(200);
    expect((await res.json()).recorded).toBe(false);
  });

  it("returns 200 (no-op) when the upsert throws", async () => {
    upsert.mockRejectedValueOnce(new Error("connection reset"));
    const res = await POST(post(good), PARAMS);
    expect(res.status).toBe(200);
    expect((await res.json()).recorded).toBe(false);
  });
});
