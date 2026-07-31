import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";

// Third-party API keys in this repo's env templates are seeded with obvious
// placeholder/demo values (e.g. "your-resend-api-key", "resend-demo-key-xxx").
// Adapters must treat any of these as "not configured" and fall back to
// simulated responses instead of making live calls that will fail with 401s.
//
// The word-list alone used to miss the most common template shape actually
// found in .env files here — bare descriptors like "vapi-api-key",
// "calcom-api-key", "openai-api-key", "vapi-webhook-secret". None contain
// "your-"/"demo"/"placeholder", so every adapter reported itself CONFIGURED
// and issued live calls with a garbage key, and validateVapiWebhookSignature
// compared Vapi's real header against the literal string "vapi-webhook-secret"
// and rejected every webhook — silently killing all tool calls.
//
// So also treat any all-lowercase kebab-case token with no digits as a
// placeholder: real credentials from these providers always carry digits,
// mixed case, or a prefix (sk-…, re_…, cal_live_…, or a UUID). A false
// positive here degrades loudly to "not configured", which is the safe
// direction; a false negative silently emits failing live calls.
const CREDENTIAL_TEMPLATE_SHAPE = /^[a-z]+(?:[-_][a-z]+)+$/;

export function isPlaceholderCredential(value: string | undefined | null): boolean {
  if (!value) return true;
  const trimmed = value.trim();
  if (!trimmed) return true;
  if (/^your-|placeholder|changeme|sample|dummy|replace|todo|^test$|demo|xxx|example/i.test(trimmed)) return true;
  return CREDENTIAL_TEMPLATE_SHAPE.test(trimmed);
}

export function validateVapiWebhookSignature(req: NextRequest): boolean {
  const secret = process.env.VAPI_WEBHOOK_SECRET;
  if (isPlaceholderCredential(secret)) {
    // Permissive only outside production; production must always require a
    // real secret. Checked via isPlaceholderCredential (not just `!secret`)
    // so a leftover template value can never be mistaken for a configured one.
    return process.env.NODE_ENV !== "production";
  }

  const headerSecret = req.headers.get("x-vapi-secret");
  if (!headerSecret) return false;

  const a = Buffer.from(headerSecret);
  const b = Buffer.from(secret as string);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** Cal.com signs webhook payloads as HMAC-SHA256 of the raw request body,
 * sent in the `X-Cal-Signature-256` header. Verified against the raw body
 * string (not a re-serialized JSON.stringify of the parsed object, which
 * can differ in key order/whitespace and silently fail signature checks). */
export function validateCalcomWebhookSignature(rawBody: string, signatureHeader: string | null): boolean {
  const secret = process.env.CALCOM_WEBHOOK_SECRET;
  if (!secret) {
    return process.env.NODE_ENV !== "production";
  }
  if (!signatureHeader) return false;

  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");

  const a = Buffer.from(signatureHeader);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function formatApiResponse<T>(
  data: T,
  status: number = 200,
  message: string = "Success",
  errors: string[] = []
) {
  return NextResponse.json(
    {
      status,
      success: status >= 200 && status < 300,
      message,
      data,
      errors,
      timestamp: new Date().toISOString(),
    },
    { status }
  );
}
