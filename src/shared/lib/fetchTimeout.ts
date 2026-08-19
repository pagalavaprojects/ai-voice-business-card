/**
 * fetch with a hard upper bound. Exists because the notification and booking
 * provider adapters (WhatsApp, Resend, Cal.com) previously called bare
 * fetch(): a provider that accepts the TCP connection and then stalls would
 * hold the visitor's booking POST open until the serverless platform killed
 * the whole function — the visitor stares at a spinner for minutes and the
 * booking outcome is lost. A bounded failure feeds the existing non-fatal
 * paths (Promise.allSettled sends, "unconfirmed" booking fallback) instead.
 *
 * NOT a retry mechanism — callers own retry/idempotency decisions; a
 * timeout here surfaces as a normal rejection (AbortError).
 */
export async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}
