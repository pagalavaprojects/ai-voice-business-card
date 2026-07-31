import { getRedisClient, isRedisConfigured } from "@/core/infrastructure/cache/redisClient";
import { checkRateLimit, type RateLimitResult } from "./rateLimitMemory";
import { Logger } from "./logger";

// Re-exported so Node-runtime callers have a single import site. Edge-runtime
// callers (middleware) MUST import from ./rateLimitMemory directly — importing
// this file from the edge pulls in ioredis and fails the build.
export { checkRateLimit, __resetInMemoryRateLimit } from "./rateLimitMemory";
export type { RateLimitResult } from "./rateLimitMemory";

/**
 * INCR the window counter and set its TTL in one atomic round trip.
 *
 * INCR followed by a separate EXPIRE has a real failure mode: if the process
 * dies between the two commands the key persists with no expiry, and that
 * identifier is counted forever — a permanent lockout. Running both inside one
 * Lua script makes the pair atomic, so the key can never exist without a TTL.
 *
 * Returns the post-increment count.
 */
const INCR_WITH_TTL = `
  local current = redis.call('INCR', KEYS[1])
  if current == 1 then
    redis.call('PEXPIRE', KEYS[1], ARGV[1])
  end
  return current
`;

/**
 * Distributed fixed-window rate limit shared across every server instance.
 *
 * Fails OPEN if Redis is unreachable: a rate limiter is a protective control,
 * not an authorization control, so taking the entire admin API down because
 * the cache blipped trades a small abuse risk for a total outage. Authorization
 * is enforced separately and always fails closed. The degradation is logged so
 * it cannot pass silently.
 */
export async function checkRateLimitDistributed(
  identifier: string,
  limit = 60,
  windowMs = 60_000
): Promise<RateLimitResult> {
  if (!isRedisConfigured()) {
    return checkRateLimit(identifier, limit, windowMs);
  }

  try {
    const redis = getRedisClient();
    const key = `ratelimit:${identifier}`;
    const count = (await redis.eval(INCR_WITH_TTL, 1, key, String(windowMs))) as number;

    if (count > limit) {
      return { allowed: false, remaining: 0, backend: "redis" };
    }
    return { allowed: true, remaining: Math.max(0, limit - count), backend: "redis" };
  } catch (err) {
    Logger.warn("Redis rate limiter unavailable — falling back to per-process limiting", {
      error: err instanceof Error ? err.message : String(err),
    });
    return checkRateLimit(identifier, limit, windowMs);
  }
}
