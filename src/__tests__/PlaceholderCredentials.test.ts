import { isPlaceholderCredential } from "@/shared/lib/security";

/**
 * Regression tests for a real production bug: the original word-list-only
 * detector missed the exact template values sitting in this repo's .env
 * files ("vapi-api-key", "calcom-api-key", "openai-api-key",
 * "vapi-webhook-secret"). Because none of them matched, every adapter
 * reported itself CONFIGURED and made live API calls with a garbage key,
 * and validateVapiWebhookSignature compared Vapi's real header against the
 * literal string "vapi-webhook-secret" — rejecting every inbound webhook and
 * silently killing all voice tool calls (save_lead, book_appointment).
 */
describe("isPlaceholderCredential", () => {
  it("catches the bare kebab-case template values that caused the original bug", () => {
    for (const value of [
      "vapi-api-key",
      "vapi-webhook-secret",
      "calcom-api-key",
      "resend-api-key",
      "openai-api-key",
      "some_service_token",
    ]) {
      expect(isPlaceholderCredential(value)).toBe(true);
    }
  });

  it("still catches the explicitly-worded placeholders", () => {
    for (const value of ["your-vapi-api-key", "placeholder-key", "changeme", "demo-vapi-key", "resend-demo-key-xxx"]) {
      expect(isPlaceholderCredential(value)).toBe(true);
    }
  });

  it("treats empty/missing values as placeholders", () => {
    expect(isPlaceholderCredential(undefined)).toBe(true);
    expect(isPlaceholderCredential(null)).toBe(true);
    expect(isPlaceholderCredential("")).toBe(true);
    expect(isPlaceholderCredential("   ")).toBe(true);
  });

  // Synthetic values only. These mimic the SHAPE of each provider's
  // credentials — which is all the detector inspects — without embedding any
  // real key. An earlier version of this test used values copied from a live
  // .env, which is needless exposure in a public repository even for
  // publishable keys, and makes a routine `git grep` for secrets noisy enough
  // that a genuine leak could hide in the false positives.
  it("does NOT false-positive on real credential shapes from these providers", () => {
    for (const value of [
      // Note: these must not contain "example", "demo", "sample" etc., or the
      // detector correctly classifies them as placeholders and the assertion
      // inverts — which is exactly what happened on the first attempt here.
      "00000000-1111-2222-3333-444444444444", // Vapi public key (UUID shape)
      "sk-proj-7fQ2mN8xR4tL", // OpenAI
      "re_9kD3pW7q", // Resend
      "cal_live_4hT8vB2n", // Cal.com
      "eyJhbGciOiJIUzI1NiJ9.aGVsbG8.c2ln", // JWT shape (Supabase service role)
      "sb_publishable_6mQ4rZ9wK2",
      "https://abcdefghijklmnop.supabase.co",
      "redis://localhost:6379",
    ]) {
      expect(isPlaceholderCredential(value)).toBe(false);
    }
  });
});
