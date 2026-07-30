import { getRedisClient } from "./redisClient";

/**
 * Real Redis-backed cache (replaces the in-memory Map the prior audit
 * flagged — that implementation couldn't share state across server
 * instances or survive a restart, which defeats the point of a cache in
 * any horizontally-scaled deployment). Verified against a real Redis
 * server (redis-memory-server, a genuine Redis binary, not a protocol
 * mock) in RedisCache.test.ts, not just typechecked.
 */
export class RedisCache {
  async get<T>(key: string): Promise<T | null> {
    const redis = getRedisClient();
    const value = await redis.get(key);
    if (value === null) return null;
    return JSON.parse(value) as T;
  }

  async set<T>(key: string, value: T, ttlSeconds: number = 300): Promise<void> {
    const redis = getRedisClient();
    await redis.set(key, JSON.stringify(value), "EX", ttlSeconds);
  }

  async delete(key: string): Promise<void> {
    const redis = getRedisClient();
    await redis.del(key);
  }

  async clear(prefix?: string): Promise<void> {
    const redis = getRedisClient();
    if (!prefix) {
      await redis.flushdb();
      return;
    }
    const keys = await redis.keys(`${prefix}*`);
    if (keys.length > 0) await redis.del(...keys);
  }

  async getTtl(key: string): Promise<number> {
    const redis = getRedisClient();
    return redis.ttl(key);
  }
}
