/**
 * Per-process, in-memory rate limiting with ZERO runtime dependencies.
 *
 * Deliberately isolated from the Redis-backed limiter in rateLimit.ts.
 * Next.js middleware runs on the Edge runtime, which cannot bundle ioredis
 * (it reaches for node:diagnostics_channel and raw TCP sockets) — importing
 * the Redis module from middleware fails the production build outright with
 * "UnhandledSchemeError: Reading from node:diagnostics_channel". Keeping this
 * file dependency-free is what lets the edge middleware share the same
 * algorithm without dragging Node built-ins into the edge bundle.
 *
 * Correct only on a single instance: with N replicas each keeps its own
 * tally, so the effective ceiling is N x limit. That is acceptable for the
 * coarse edge pre-filter; the authoritative per-user limit is the Redis-backed
 * one applied in the Node runtime.
 */

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  /** Which backend decided, so callers and tests can distinguish a genuinely
   * distributed decision from a per-process one. */
  backend: "redis" | "memory";
}

const requestCounts = new Map<string, { count: number; expiresAt: number }>();

/** Sweep expired entries. Without this the Map grows unbounded on a
 * long-running server — every distinct IP ever seen stays resident forever,
 * a slow leak in exactly the process that should stay up longest. Bounded
 * work: only sweeps once the map is already large. */
function evictExpired(now: number): void {
  if (requestCounts.size < 10_000) return;
  for (const [key, record] of requestCounts) {
    if (record.expiresAt < now) requestCounts.delete(key);
  }
}

export function checkRateLimit(identifier: string, limit = 60, windowMs = 60_000): RateLimitResult {
  const now = Date.now();
  evictExpired(now);

  const record = requestCounts.get(identifier);

  if (!record || record.expiresAt < now) {
    requestCounts.set(identifier, { count: 1, expiresAt: now + windowMs });
    return { allowed: true, remaining: limit - 1, backend: "memory" };
  }

  if (record.count >= limit) {
    return { allowed: false, remaining: 0, backend: "memory" };
  }

  record.count += 1;
  return { allowed: true, remaining: limit - record.count, backend: "memory" };
}

/** Test seam: clears state between cases. */
export function __resetInMemoryRateLimit(): void {
  requestCounts.clear();
}
