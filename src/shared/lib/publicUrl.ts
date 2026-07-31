/**
 * Resolves the base URL that THIRD-PARTY SERVERS (Vapi, Cal.com) must use to
 * call back into this app.
 *
 * This is not cosmetic. Vapi delivers tool-calls and end-of-call reports from
 * its own cloud infrastructure, so a callback URL of http://localhost:3000
 * resolves to Vapi's machine, not the developer's — every save_lead and
 * book_appointment silently never arrives. The request origin is therefore
 * only usable when it is genuinely public, and an explicit override has to
 * win over it (a tunnel like ngrok during local development, or the real
 * domain behind a proxy in production).
 */

const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1", "[::1]"]);

/** True when third-party servers on the public internet could actually reach this origin. */
export function isPubliclyReachable(origin: string | undefined | null): boolean {
  if (!origin) return false;
  let hostname: string;
  try {
    hostname = new URL(origin).hostname.toLowerCase();
  } catch {
    return false;
  }
  if (LOCAL_HOSTNAMES.has(hostname)) return false;
  if (hostname.endsWith(".local") || hostname.endsWith(".internal")) return false;
  // RFC1918 / link-local ranges — reachable on a LAN, never from Vapi's cloud.
  if (/^10\./.test(hostname)) return false;
  if (/^192\.168\./.test(hostname)) return false;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(hostname)) return false;
  if (/^169\.254\./.test(hostname)) return false;
  return true;
}

/**
 * Returns a publicly reachable base URL, or null when none is available.
 * Null is meaningful: callers must degrade honestly (omit the callback and the
 * tools that depend on it) rather than hand a third party an address it cannot
 * reach and let the failure surface mid-call as a broken promise to the visitor.
 *
 * Precedence: explicit override first (survives proxies/tunnels, which rewrite
 * the request origin), then the request's own origin if it is already public.
 */
export function resolvePublicBaseUrl(requestOrigin?: string | null): string | null {
  const override = process.env.PUBLIC_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL;
  if (isPubliclyReachable(override)) return (override as string).replace(/\/+$/, "");
  if (isPubliclyReachable(requestOrigin)) return (requestOrigin as string).replace(/\/+$/, "");
  return null;
}
