import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";

// Third-party API keys in this repo's env templates are seeded with obvious
// placeholder/demo values (e.g. "your-resend-api-key", "resend-demo-key-xxx").
// Adapters must treat any of these as "not configured" and fall back to
// simulated responses instead of making live calls that will fail with 401s.
export function isPlaceholderCredential(value: string | undefined | null): boolean {
  if (!value) return true;
  return /^your-|placeholder|demo|changeme|xxx|example/i.test(value);
}

export function validateVapiWebhookSignature(req: NextRequest): boolean {
  const secret = process.env.VAPI_WEBHOOK_SECRET;
  if (!secret) {
    // Permissive only outside production; production must always require a secret.
    return process.env.NODE_ENV !== "production";
  }

  const headerSecret = req.headers.get("x-vapi-secret");
  if (!headerSecret) return false;

  const a = Buffer.from(headerSecret);
  const b = Buffer.from(secret);
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
