/**
 * Resolve a caller-supplied post-auth `next` target down to a SAME-ORIGIN
 * path, or fall back to a safe default.
 *
 * The naive guard `next.startsWith("/") && !next.startsWith("//")` is NOT
 * enough: a backslash or tab ("/\\evil.com", "/\t/evil.com") passes it, yet
 * the URL parser and browsers normalise those to a protocol-relative
 * "//evil.com" and navigate off-site — an open redirect on every emailed auth
 * link. Resolving against our own origin and re-checking the resolved origin
 * closes every such normalisation trick, because whatever the input, the
 * parser tells us the true destination.
 *
 * Returns only the path+query+hash when the resolved origin matches; otherwise
 * `fallback`.
 */
export function sameOriginPath(next: string | null | undefined, origin: string, fallback = "/dashboard"): string {
  if (!next) return fallback;
  try {
    const resolved = new URL(next, origin);
    if (resolved.origin === origin) return resolved.pathname + resolved.search + resolved.hash;
  } catch {
    /* malformed input — fall through to the safe default */
  }
  return fallback;
}
