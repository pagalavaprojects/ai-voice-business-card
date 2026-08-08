import { NextRequest } from "next/server";

/**
 * Regression test for the Vapi webhook's tool-calls branch: a valid
 * signature/token only proves the request came from a call this app
 * provisioned — it says nothing about the shape of what Vapi actually sent.
 * `const { name, arguments: args } = toolCall.function` previously
 * destructured with no validation; a malformed toolCall (missing `function`,
 * or `function` not an object) threw straight through to the outer catch as
 * an opaque 500 instead of a controlled 400 — this exercises that boundary
 * without touching the well-formed happy path other suites already cover.
 */

const getOrCreateConversationByVapiCallId = jest.fn();
const appendToolCalled = jest.fn();
jest.mock("@/core/infrastructure/database/supabase/SupabaseConversationRepository", () => ({
  SupabaseConversationRepository: jest.fn().mockImplementation(() => ({
    getOrCreateConversationByVapiCallId: (...args: unknown[]) => getOrCreateConversationByVapiCallId(...args),
    appendToolCalled: (...args: unknown[]) => appendToolCalled(...args),
  })),
}));

jest.mock("@/core/infrastructure/database/supabase/SupabaseKnowledgeRepository", () => ({
  SupabaseKnowledgeRepository: jest.fn().mockImplementation(() => ({})),
}));
jest.mock("@/core/infrastructure/storage/SupabaseStorageAdapter", () => ({
  SupabaseStorageAdapter: jest.fn().mockImplementation(() => ({})),
}));
jest.mock("@/shared/lib/supabase", () => ({ supabaseAdmin: {} }));
jest.mock("@/core/infrastructure/bootstrap/assistantRuntime", () => ({
  promptAssemblyService: {},
  toolRegistry: { getTool: (...args: unknown[]) => getTool(...args) },
  agentRepo: {},
  settingsRepo: {},
}));

const getTool = jest.fn();
const execute = jest.fn();

import { POST } from "@/app/api/vapi/webhook/route";

const ORIGINAL_ENV = process.env;

function toolCallRequest(toolCalls: unknown, callId = "call-1"): NextRequest {
  const req = new NextRequest("http://localhost/api/vapi/webhook?companyId=comp-1&employeeId=emp-1", {
    method: "POST",
  });
  req.json = async () => ({
    message: { type: "tool-calls", call: { id: callId }, toolCalls },
  });
  return req;
}

describe("POST /api/vapi/webhook — tool-calls payload shape", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Permissive signature path (see security.ts): no real secret configured
    // outside production, matching how this route already behaves in dev/CI.
    process.env = { ...ORIGINAL_ENV, NODE_ENV: "test", VAPI_WEBHOOK_SECRET: "" };
    getOrCreateConversationByVapiCallId.mockResolvedValue({ id: "11111111-1111-1111-1111-111111111111" });
    getTool.mockReturnValue({ execute });
    execute.mockResolvedValue({ success: true });
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it("dispatches a well-formed tool call normally", async () => {
    const res = await POST(toolCallRequest([{ id: "tc-1", function: { name: "search_products", arguments: { query: "voice" } } }]));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(getTool).toHaveBeenCalledWith("search_products");
    expect(execute).toHaveBeenCalledWith({ query: "voice" }, expect.objectContaining({ companyId: "comp-1", employeeId: "emp-1" }));
    expect(JSON.parse(json.results[0].result)).toEqual({ success: true });
  });

  it("returns a controlled 400, not a 500, when toolCall.function is missing entirely", async () => {
    const res = await POST(toolCallRequest([{ id: "tc-1" }]));

    expect(res.status).toBe(400);
    expect(execute).not.toHaveBeenCalled();
  });

  it("returns a controlled 400 when function.name is missing", async () => {
    const res = await POST(toolCallRequest([{ id: "tc-1", function: { arguments: {} } }]));
    expect(res.status).toBe(400);
  });

  it("returns a controlled 400 when function.arguments is not an object", async () => {
    const res = await POST(toolCallRequest([{ id: "tc-1", function: { name: "search_products", arguments: "not-an-object" } }]));
    expect(res.status).toBe(400);
    expect(execute).not.toHaveBeenCalled();
  });

  it("still returns 400 for an empty toolCalls array (pre-existing behavior, unaffected by the new check)", async () => {
    const res = await POST(toolCallRequest([]));
    expect(res.status).toBe(400);
  });
});
