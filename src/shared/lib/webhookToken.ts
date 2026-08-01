import { createHmac, timingSafeEqual } from "crypto";

/**
 * Signed callback tokens for Vapi webhooks.
 *
 * Why this exists: the browser starts calls with an inline assistant config
 * containing `server: { url }`, and that inline config OVERRIDES whatever
 * server settings the assistant has in Vapi's dashboard — including its
 * secret. Vapi therefore sends `x-vapi-secret` with an empty value, and a
 * dashboard credential can never authenticate these calls. Verified in
 * production: the header arrives present but zero-length.
 *
 * The fix cannot be to put VAPI_WEBHOOK_SECRET in the inline config, because
 * that config is assembled in the browser and would expose the secret to
 * anyone who opens devtools. Instead the server signs the callback URL it
 * hands out: the browser only ever sees a derived, scoped, expiring HMAC, and
 * the underlying secret never leaves the server.
 *
 * A token authorises webhook delivery for ONE company/employee pair until it
 * expires. It is not a bearer credential for anything else — the webhook
 * still resolves its own company/employee from the signed values rather than
 * trusting arbitrary query parameters.
 */

const TOKEN_TTL_MS = 6 * 60 * 60 * 1000; // 6h — comfortably longer than any call

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

function getSecret(): string | null {
  const secret = process.env.VAPI_WEBHOOK_SECRET;
  return secret && secret.trim().length > 0 ? secret : null;
}

/** Returns `<expiresAt>.<hmac>`, or null when no secret is configured. */
export function createWebhookToken(companyId: string, employeeId: string, now = Date.now()): string | null {
  const secret = getSecret();
  if (!secret) return null;
  const expiresAt = now + TOKEN_TTL_MS;
  return `${expiresAt}.${sign(`${companyId}:${employeeId}:${expiresAt}`, secret)}`;
}

/**
 * Verifies a token against the company/employee it claims to authorise.
 *
 * Binding the signature to both ids is what stops a token leaked from one
 * company's public card being replayed to write webhooks against another's.
 */
export function verifyWebhookToken(
  token: string | null | undefined,
  companyId: string,
  employeeId: string,
  now = Date.now()
): boolean {
  const secret = getSecret();
  if (!secret || !token) return false;

  const separator = token.indexOf(".");
  if (separator <= 0) return false;

  const expiresAt = Number(token.slice(0, separator));
  const provided = token.slice(separator + 1);
  if (!Number.isFinite(expiresAt) || expiresAt < now) return false;

  const expected = sign(`${companyId}:${employeeId}:${expiresAt}`, secret);

  // Length check first: timingSafeEqual throws on differing lengths, and a
  // length mismatch is not secret-dependent anyway.
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
