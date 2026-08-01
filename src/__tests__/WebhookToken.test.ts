import { createWebhookToken, verifyWebhookToken } from "@/shared/lib/webhookToken";

const COMPANY = "33333333-3333-3333-3333-333333333333";
const EMPLOYEE = "44444444-4444-4444-4444-444444444444";

describe("signed webhook callback tokens", () => {
  const original = process.env.VAPI_WEBHOOK_SECRET;
  beforeEach(() => {
    process.env = { ...process.env, VAPI_WEBHOOK_SECRET: "test-secret-value-not-a-real-key" };
  });
  afterAll(() => {
    process.env = { ...process.env, VAPI_WEBHOOK_SECRET: original };
  });

  it("accepts a token it just issued", () => {
    const token = createWebhookToken(COMPANY, EMPLOYEE);
    expect(token).toBeTruthy();
    expect(verifyWebhookToken(token, COMPANY, EMPLOYEE)).toBe(true);
  });

  it("rejects a token replayed against a different tenant", () => {
    // The whole point of binding the signature to both ids: a token lifted
    // from one company's public card must not authorise writing webhooks
    // against another company's data.
    const token = createWebhookToken(COMPANY, EMPLOYEE);
    expect(verifyWebhookToken(token, "11111111-1111-1111-1111-111111111111", EMPLOYEE)).toBe(false);
    expect(verifyWebhookToken(token, COMPANY, "22222222-2222-2222-2222-222222222222")).toBe(false);
  });

  it("rejects an expired token", () => {
    const issuedAt = Date.now() - 24 * 60 * 60 * 1000; // yesterday
    const token = createWebhookToken(COMPANY, EMPLOYEE, issuedAt);
    expect(verifyWebhookToken(token, COMPANY, EMPLOYEE)).toBe(false);
  });

  it("rejects a tampered signature", () => {
    const token = createWebhookToken(COMPANY, EMPLOYEE) as string;
    const [expiry, sig] = token.split(".");
    const flipped = sig[0] === "a" ? "b" : "a";
    expect(verifyWebhookToken(`${expiry}.${flipped}${sig.slice(1)}`, COMPANY, EMPLOYEE)).toBe(false);
  });

  it("rejects an extended expiry — the expiry is signed, not just appended", () => {
    const token = createWebhookToken(COMPANY, EMPLOYEE) as string;
    const sig = token.split(".")[1];
    const farFuture = Date.now() + 10 * 365 * 24 * 60 * 60 * 1000;
    expect(verifyWebhookToken(`${farFuture}.${sig}`, COMPANY, EMPLOYEE)).toBe(false);
  });

  it("rejects malformed and missing tokens", () => {
    for (const bad of [null, undefined, "", "no-separator", ".", "abc.def"]) {
      expect(verifyWebhookToken(bad, COMPANY, EMPLOYEE)).toBe(false);
    }
  });

  it("issues nothing when no secret is configured, and verifies nothing either", () => {
    process.env = { ...process.env, VAPI_WEBHOOK_SECRET: "" };
    expect(createWebhookToken(COMPANY, EMPLOYEE)).toBeNull();
    expect(verifyWebhookToken("anything", COMPANY, EMPLOYEE)).toBe(false);
  });
});
