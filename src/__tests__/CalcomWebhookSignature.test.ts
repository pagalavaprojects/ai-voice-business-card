import { createHmac } from "crypto";
import { validateCalcomWebhookSignature } from "@/shared/lib/security";

const ORIGINAL_ENV = process.env;

describe("validateCalcomWebhookSignature", () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it("accepts a correctly-signed payload", () => {
    process.env.CALCOM_WEBHOOK_SECRET = "test-secret";
    const body = JSON.stringify({ triggerEvent: "BOOKING_CANCELLED", payload: { uid: "abc123" } });
    const signature = createHmac("sha256", "test-secret").update(body).digest("hex");

    expect(validateCalcomWebhookSignature(body, signature)).toBe(true);
  });

  it("rejects a payload signed with the wrong secret", () => {
    process.env.CALCOM_WEBHOOK_SECRET = "test-secret";
    const body = JSON.stringify({ triggerEvent: "BOOKING_CANCELLED", payload: { uid: "abc123" } });
    const wrongSignature = createHmac("sha256", "wrong-secret").update(body).digest("hex");

    expect(validateCalcomWebhookSignature(body, wrongSignature)).toBe(false);
  });

  it("rejects a tampered body even with a signature computed for the original body", () => {
    process.env.CALCOM_WEBHOOK_SECRET = "test-secret";
    const originalBody = JSON.stringify({ triggerEvent: "BOOKING_CANCELLED", payload: { uid: "abc123" } });
    const signature = createHmac("sha256", "test-secret").update(originalBody).digest("hex");
    const tamperedBody = JSON.stringify({ triggerEvent: "BOOKING_CANCELLED", payload: { uid: "someone-elses-booking" } });

    expect(validateCalcomWebhookSignature(tamperedBody, signature)).toBe(false);
  });

  it("rejects a missing signature header when a secret is configured", () => {
    process.env.CALCOM_WEBHOOK_SECRET = "test-secret";
    expect(validateCalcomWebhookSignature("{}", null)).toBe(false);
  });

  it("fails closed in production when no secret is configured", () => {
    process.env.NODE_ENV = "production";
    delete process.env.CALCOM_WEBHOOK_SECRET;
    expect(validateCalcomWebhookSignature("{}", null)).toBe(false);
  });

  it("is permissive outside production when no secret is configured (local dev)", () => {
    process.env.NODE_ENV = "development";
    delete process.env.CALCOM_WEBHOOK_SECRET;
    expect(validateCalcomWebhookSignature("{}", null)).toBe(true);
  });
});
