/**
 * POST /api/public/{companyId}/{employeeId}/qualification-status — the
 * voiceless (text/button) answer submission. It must classify + persist each
 * Yes/No/Maybe tap through the SAME server-authoritative sequencing tool the
 * voice flow used (get_next_qualification_question), keyed by a client session
 * id, and return the authoritative answers so the UI advances from server
 * truth. No voice, no Vapi, no TTS involved anywhere in this path.
 */
const getTool = jest.fn();
const execute = jest.fn(async () => ({ action: "ask_verbatim", question_number: 2 }));
const getOrCreateConversationByVapiCallId = jest.fn(async (..._a: unknown[]) => ({ id: "conv-1" }));
const checkRateLimitDistributed = jest.fn(async (..._a: unknown[]) => ({ allowed: true }));

// The lead the tool wrote, read back through supabaseAdmin.
let conversationRow: unknown = { id: "conv-1" };
let leadRow: unknown = { qualification_notes: "Q1 [YES] (2027-01-01T00:00:00.000Z): Yes" };

function builder(kind: "conversations" | "leads") {
  const b: Record<string, unknown> = {};
  for (const m of ["select", "eq", "order", "limit"]) b[m] = () => b;
  b.maybeSingle = async () => ({ data: kind === "conversations" ? conversationRow : leadRow, error: null });
  return b;
}

jest.mock("@/shared/lib/supabase", () => ({
  supabaseAdmin: { from: (table: string) => builder(table as "conversations" | "leads") },
}));
jest.mock("@/core/infrastructure/bootstrap/assistantRuntime", () => ({
  toolRegistry: { getTool: (...a: unknown[]) => getTool(...a) },
}));
jest.mock("@/core/infrastructure/database/supabase/SupabaseConversationRepository", () => ({
  SupabaseConversationRepository: jest.fn().mockImplementation(() => ({
    getOrCreateConversationByVapiCallId: (...a: unknown[]) => getOrCreateConversationByVapiCallId(...a),
  })),
}));
jest.mock("@/shared/lib/rateLimit", () => ({ checkRateLimitDistributed: (...a: unknown[]) => checkRateLimitDistributed(...a) }));

import { NextRequest } from "next/server";
import { POST } from "@/app/api/public/[companyId]/[employeeId]/qualification-status/route";

const PARAMS = { params: { companyId: "c1", employeeId: "e1" } };
function post(body: unknown) {
  return new NextRequest("http://localhost/api/public/c1/e1/qualification-status", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  checkRateLimitDistributed.mockResolvedValue({ allowed: true });
  getTool.mockReturnValue({ execute });
  conversationRow = { id: "conv-1" };
  leadRow = { qualification_notes: "Q1 [YES] (2027-01-01T00:00:00.000Z): Yes" };
});

describe("validation", () => {
  it("400s a missing/short session id", async () => {
    const res = await POST(post({ sessionId: "x", questionNumber: 1, answer: "Yes" }), PARAMS);
    expect(res.status).toBe(400);
    expect(execute).not.toHaveBeenCalled();
  });
  it("400s a question number outside 1..6", async () => {
    expect((await POST(post({ sessionId: "web-abcdefgh", questionNumber: 0, answer: "Yes" }), PARAMS)).status).toBe(400);
    expect((await POST(post({ sessionId: "web-abcdefgh", questionNumber: 7, answer: "Yes" }), PARAMS)).status).toBe(400);
  });
  it("400s an empty answer", async () => {
    expect((await POST(post({ sessionId: "web-abcdefgh", questionNumber: 1, answer: "" }), PARAMS)).status).toBe(400);
  });
  it("429s when rate limited", async () => {
    checkRateLimitDistributed.mockResolvedValueOnce({ allowed: false });
    expect((await POST(post({ sessionId: "web-abcdefgh", questionNumber: 1, answer: "Yes" }), PARAMS)).status).toBe(429);
  });
});

describe("happy path — drives the sequencing tool, returns authoritative answers", () => {
  it("resolves a conversation by the session id and runs get_next_qualification_question with the tapped answer", async () => {
    const res = await POST(post({ sessionId: "web-session-1234", questionNumber: 1, answer: "Yes", language: "ta" }), PARAMS);
    expect(res.status).toBe(200);
    expect(getOrCreateConversationByVapiCallId).toHaveBeenCalledWith("c1", "e1", "web-session-1234", "ta");
    expect(getTool).toHaveBeenCalledWith("get_next_qualification_question");
    // The tap is passed as the raw answer for the SERVER to classify.
    expect(execute).toHaveBeenCalledWith(
      { last_answered_question: 1, user_response: "Yes" },
      { companyId: "c1", employeeId: "e1", conversationId: "conv-1", language: "ta" }
    );
    const body = await res.json();
    expect(body.answers).toEqual([{ n: 1, c: "YES", a: "Yes" }]);
    expect(body.accepted).toBe(true);
  });

  it("reports qualified once the sixth data point is recorded", async () => {
    leadRow = {
      qualification_notes: [1, 2, 3, 4, 5, 6].map((n) => `Q${n} [YES] (2027-01-01T00:00:00.000Z): Yes`).join("\n"),
    };
    const res = await POST(post({ sessionId: "web-session-1234", questionNumber: 6, answer: "Yes" }), PARAMS);
    const body = await res.json();
    expect(body.qualified).toBe(true);
    expect(body.answers).toHaveLength(6);
  });

  it("reports accepted:false when the tool reprompts (answer not classified)", async () => {
    execute.mockResolvedValueOnce({ action: "reprompt", question_number: 1 });
    leadRow = { qualification_notes: "" };
    const res = await POST(post({ sessionId: "web-session-1234", questionNumber: 1, answer: "huh?" }), PARAMS);
    const body = await res.json();
    expect(body.accepted).toBe(false);
  });
});
