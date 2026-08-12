import { createHmac } from "crypto";
import { NextRequest } from "next/server";

/**
 * Route-level tests for the WhatsApp webhook: verification, signature
 * checking, malformed payloads, employee resolution, idempotency, and
 * locking. The actual qualification reuse (classification/sequencing/
 * persistence) is proven separately in WhatsAppQualificationChannel.test.ts
 * against a REAL ToolRegistry — this file mocks the channel itself so it
 * can verify the route's OWN wiring without re-testing that.
 */

const getEmployeeByWhatsAppPhoneNumberId = jest.fn();
const claimMessage = jest.fn();
const tryAcquire = jest.fn();
const release = jest.fn();
const handleInboundMessage = jest.fn();

jest.mock("@/core/infrastructure/database/supabase/SupabaseKnowledgeRepository", () => ({
  SupabaseKnowledgeRepository: jest.fn().mockImplementation(() => ({
    getEmployeeByWhatsAppPhoneNumberId: (...args: unknown[]) => getEmployeeByWhatsAppPhoneNumberId(...args),
  })),
}));

jest.mock("@/core/infrastructure/database/supabase/SupabaseConversationRepository", () => ({
  SupabaseConversationRepository: jest.fn().mockImplementation(() => ({})),
}));

jest.mock("@/core/infrastructure/notifications/WhatsAppIdempotency", () => ({
  SupabaseWhatsAppIdempotencyStore: jest.fn().mockImplementation(() => ({
    claimMessage: (...args: unknown[]) => claimMessage(...args),
  })),
}));

jest.mock("@/core/infrastructure/notifications/WhatsAppConversationLock", () => ({
  SupabaseWhatsAppConversationLock: jest.fn().mockImplementation(() => ({
    tryAcquire: (...args: unknown[]) => tryAcquire(...args),
    release: (...args: unknown[]) => release(...args),
  })),
}));

jest.mock("@/core/infrastructure/notifications/WhatsAppNotifier", () => ({
  getWhatsAppNotifier: jest.fn().mockReturnValue({ isConfigured: () => true, send: jest.fn().mockResolvedValue({ sent: true }) }),
}));

jest.mock("@/core/infrastructure/bootstrap/assistantRuntime", () => ({
  toolRegistry: { getTool: jest.fn() },
}));

jest.mock("@/core/application/services/WhatsAppQualificationChannel", () => ({
  WhatsAppQualificationChannel: jest.fn().mockImplementation(() => ({
    handleInboundMessage: (...args: unknown[]) => handleInboundMessage(...args),
  })),
}));

jest.mock("@/shared/lib/rateLimit", () => ({
  checkRateLimitDistributed: jest.fn().mockResolvedValue({ allowed: true }),
}));

import { GET, POST } from "@/app/api/whatsapp/webhook/route";

const APP_SECRET = "whatsapp-test-secret-9f8e7d6c";
const VERIFY_TOKEN = "wa-verify-token-4d3c2b1a";

function textMessagePayload(overrides: { from?: string; id?: string; body?: string; phoneNumberId?: string } = {}) {
  return JSON.stringify({
    object: "whatsapp_business_account",
    entry: [
      {
        id: "waba-1",
        changes: [
          {
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              metadata: { phone_number_id: overrides.phoneNumberId ?? "1234567890" },
              contacts: [{ wa_id: overrides.from ?? "919999999999" }],
              messages: [{ from: overrides.from ?? "919999999999", id: overrides.id ?? "wamid.ABC123", type: "text", text: { body: overrides.body ?? "Hi" } }],
            },
          },
        ],
      },
    ],
  });
}

function signedPost(rawBody: string, secret: string | null = APP_SECRET): NextRequest {
  const headers: Record<string, string> = {};
  if (secret) headers["x-hub-signature-256"] = "sha256=" + createHmac("sha256", secret).update(rawBody).digest("hex");
  const req = new NextRequest("http://localhost/api/whatsapp/webhook", { method: "POST", headers });
  req.text = async () => rawBody;
  return req;
}

describe("GET /api/whatsapp/webhook — verification handshake", () => {
  const ORIGINAL_ENV = process.env;
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV, WHATSAPP_VERIFY_TOKEN: VERIFY_TOKEN };
  });
  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it("echoes hub.challenge back when mode and token match", async () => {
    const req = new NextRequest(`http://localhost/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=${VERIFY_TOKEN}&hub.challenge=12345`);
    const res = await GET(req);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("12345");
  });

  it("rejects a wrong verify token", async () => {
    const req = new NextRequest(`http://localhost/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=12345`);
    const res = await GET(req);
    expect(res.status).toBe(403);
  });

  it("rejects when no verify token is configured", async () => {
    process.env = { ...ORIGINAL_ENV, WHATSAPP_VERIFY_TOKEN: undefined };
    const req = new NextRequest(`http://localhost/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=anything&hub.challenge=12345`);
    const res = await GET(req);
    expect(res.status).toBe(403);
  });

  it("rejects a correct token with the wrong hub.mode", async () => {
    const req = new NextRequest(`http://localhost/api/whatsapp/webhook?hub.mode=unsubscribe&hub.verify_token=${VERIFY_TOKEN}&hub.challenge=12345`);
    const res = await GET(req);
    expect(res.status).toBe(403);
  });

  it("rejects a correct mode and token with no hub.challenge", async () => {
    const req = new NextRequest(`http://localhost/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=${VERIFY_TOKEN}`);
    const res = await GET(req);
    expect(res.status).toBe(403);
  });

  it("rejects a request that omits hub.verify_token entirely, even with a correctly configured token", async () => {
    const req = new NextRequest(`http://localhost/api/whatsapp/webhook?hub.mode=subscribe&hub.challenge=12345`);
    const res = await GET(req);
    expect(res.status).toBe(403);
  });
});

describe("POST /api/whatsapp/webhook", () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...ORIGINAL_ENV, WHATSAPP_APP_SECRET: APP_SECRET, NODE_ENV: "production" };
    getEmployeeByWhatsAppPhoneNumberId.mockResolvedValue({ id: "emp-1", company_id: "co-1", slug: null });
    claimMessage.mockResolvedValue(true);
    tryAcquire.mockResolvedValue(true);
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it("rejects a request with an invalid signature", async () => {
    const body = textMessagePayload();
    const req = signedPost(body, "wrong-secret-1a2b3c4d");
    const res = await POST(req);
    expect(res.status).toBe(401);
    expect(handleInboundMessage).not.toHaveBeenCalled();
  });

  it("rejects a request with no x-hub-signature-256 header at all, through the real route (not just the isolated validator)", async () => {
    const req = signedPost(textMessagePayload(), null);
    const res = await POST(req);
    expect(res.status).toBe(401);
    expect(handleInboundMessage).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON without crashing", async () => {
    const req = signedPost("{not json");
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("processes a valid inbound text message end to end", async () => {
    const res = await POST(signedPost(textMessagePayload({ body: "Hi" })));
    expect(res.status).toBe(200);
    expect(getEmployeeByWhatsAppPhoneNumberId).toHaveBeenCalledWith("1234567890");
    expect(claimMessage).toHaveBeenCalledWith("wamid.ABC123");
    expect(tryAcquire).toHaveBeenCalledWith("919999999999");
    expect(handleInboundMessage).toHaveBeenCalledWith(
      expect.objectContaining({ companyId: "co-1", employeeId: "emp-1", waId: "919999999999", text: "Hi" })
    );
    expect(release).toHaveBeenCalledWith("919999999999");
  });

  it("ignores an inbound message for a phone_number_id with no configured employee", async () => {
    getEmployeeByWhatsAppPhoneNumberId.mockResolvedValue(null);
    const res = await POST(signedPost(textMessagePayload()));
    expect(res.status).toBe(200);
    expect(handleInboundMessage).not.toHaveBeenCalled();
  });

  it("a duplicate message id (Meta retry) is never processed twice", async () => {
    claimMessage.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    await POST(signedPost(textMessagePayload({ id: "wamid.DUP" })));
    await POST(signedPost(textMessagePayload({ id: "wamid.DUP" })));
    expect(handleInboundMessage).toHaveBeenCalledTimes(1);
  });

  it("a message that fails to acquire the sender lock (concurrent processing) is dropped, not processed", async () => {
    tryAcquire.mockResolvedValue(false);
    const res = await POST(signedPost(textMessagePayload()));
    expect(res.status).toBe(200);
    expect(handleInboundMessage).not.toHaveBeenCalled();
    expect(release).not.toHaveBeenCalled(); // never acquired, nothing to release
  });

  it("always releases the sender lock, even when the channel throws", async () => {
    handleInboundMessage.mockRejectedValueOnce(new Error("boom"));
    const res = await POST(signedPost(textMessagePayload()));
    expect(res.status).toBe(200); // acknowledged, not retried into a guaranteed no-op
    expect(release).toHaveBeenCalledWith("919999999999");
  });

  it("ignores non-text messages (e.g. images) without processing them", async () => {
    const body = JSON.stringify({
      object: "whatsapp_business_account",
      entry: [
        {
          changes: [
            {
              field: "messages",
              value: {
                metadata: { phone_number_id: "1234567890" },
                messages: [{ from: "919999999999", id: "wamid.IMG", type: "image" }],
              },
            },
          ],
        },
      ],
    });
    await POST(signedPost(body));
    expect(handleInboundMessage).not.toHaveBeenCalled();
  });

  it("ignores status/delivery-receipt webhook events, never treating them as messages", async () => {
    const body = JSON.stringify({
      object: "whatsapp_business_account",
      entry: [{ changes: [{ field: "statuses", value: { statuses: [{ id: "wamid.ABC123", status: "delivered" }] } }] }],
    });
    await POST(signedPost(body));
    expect(handleInboundMessage).not.toHaveBeenCalled();
  });
});
