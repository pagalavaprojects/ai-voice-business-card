import { createHmac } from "crypto";
import { validateWhatsAppWebhookSignature } from "@/shared/lib/security";

const ORIGINAL_ENV = process.env;

describe("validateWhatsAppWebhookSignature", () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it("accepts a correctly-signed payload with Meta's sha256= prefix", () => {
    process.env.WHATSAPP_APP_SECRET = "whatsapp-test-secret-9f8e7d6c";
    const body = JSON.stringify({ object: "whatsapp_business_account", entry: [] });
    const signature = "sha256=" + createHmac("sha256", "whatsapp-test-secret-9f8e7d6c").update(body).digest("hex");

    expect(validateWhatsAppWebhookSignature(body, signature)).toBe(true);
  });

  it("accepts the same signature without the sha256= prefix (defensive)", () => {
    process.env.WHATSAPP_APP_SECRET = "whatsapp-test-secret-9f8e7d6c";
    const body = "{}";
    const signature = createHmac("sha256", "whatsapp-test-secret-9f8e7d6c").update(body).digest("hex");

    expect(validateWhatsAppWebhookSignature(body, signature)).toBe(true);
  });

  it("rejects a payload signed with the wrong app secret", () => {
    process.env.WHATSAPP_APP_SECRET = "whatsapp-test-secret-9f8e7d6c";
    const body = JSON.stringify({ object: "whatsapp_business_account" });
    const wrongSignature = "sha256=" + createHmac("sha256", "wrong-secret-1a2b3c4d").update(body).digest("hex");

    expect(validateWhatsAppWebhookSignature(body, wrongSignature)).toBe(false);
  });

  it("rejects a tampered body even with a signature computed for the original body", () => {
    process.env.WHATSAPP_APP_SECRET = "whatsapp-test-secret-9f8e7d6c";
    const originalBody = JSON.stringify({ entry: [{ id: "1" }] });
    const signature = "sha256=" + createHmac("sha256", "whatsapp-test-secret-9f8e7d6c").update(originalBody).digest("hex");
    const tamperedBody = JSON.stringify({ entry: [{ id: "someone-elses-account" }] });

    expect(validateWhatsAppWebhookSignature(tamperedBody, signature)).toBe(false);
  });

  it("rejects a missing signature header when an app secret is configured", () => {
    process.env.WHATSAPP_APP_SECRET = "whatsapp-test-secret-9f8e7d6c";
    expect(validateWhatsAppWebhookSignature("{}", null)).toBe(false);
  });

  it("fails closed in production when no app secret is configured", () => {
    process.env = { ...process.env, NODE_ENV: "production" };
    delete process.env.WHATSAPP_APP_SECRET;
    expect(validateWhatsAppWebhookSignature("{}", null)).toBe(false);
  });

  it("is permissive outside production when no app secret is configured (local dev)", () => {
    process.env = { ...process.env, NODE_ENV: "development" };
    delete process.env.WHATSAPP_APP_SECRET;
    expect(validateWhatsAppWebhookSignature("{}", null)).toBe(true);
  });
});
