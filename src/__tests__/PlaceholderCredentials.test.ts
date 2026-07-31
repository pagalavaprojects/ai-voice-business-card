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

  it("does NOT false-positive on real credential shapes from these providers", () => {
    for (const value of [
      "2c9684ed-f228-412f-88dc-42a9f4e94ad6", // Vapi public key (UUID)
      "sk-proj-abc123XYZ", // OpenAI
      "re_123abc", // Resend
      "cal_live_9f8e7d", // Cal.com
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.abc", // Supabase service-role JWT
      "sb_publishable_61NtxdptlDoo25LN",
      "https://atiylleojxtjeruppyhq.supabase.co",
      "redis://localhost:6379",
    ]) {
      expect(isPlaceholderCredential(value)).toBe(false);
    }
  });
});
