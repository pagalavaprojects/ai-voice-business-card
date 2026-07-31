import { RedisMemoryServer } from "redis-memory-server";
import { checkRateLimit, checkRateLimitDistributed, __resetInMemoryRateLimit } from "@/shared/lib/rateLimit";
import { closeRedisClient, getRedisClient } from "@/core/infrastructure/cache/redisClient";

/**
 * Runs against a real Redis binary (redis-memory-server), not a protocol mock,
 * because the properties that matter here are Redis semantics: that INCR and
 * PEXPIRE are applied atomically, and that two independent "instances" sharing
 * one Redis genuinely share a budget. A mock would assert only that we called
 * the functions we wrote.
 */
describe("distributed rate limiting", () => {
  let server: RedisMemoryServer;

  beforeAll(async () => {
    server = new RedisMemoryServer();
    const host = await server.getHost();
    const port = await server.getPort();
    process.env.REDIS_URL = `redis://${host}:${port}`;
  }, 60_000);

  afterAll(async () => {
    await closeRedisClient();
    await server.stop();
  });

  beforeEach(async () => {
    __resetInMemoryRateLimit();
    await getRedisClient().flushdb();
  });

  it("allows requests up to the limit and blocks the next one", async () => {
    const id = `user-${Date.now()}-a`;
    for (let i = 0; i < 5; i++) {
      const result = await checkRateLimitDistributed(id, 5, 60_000);
      expect(result.allowed).toBe(true);
      expect(result.backend).toBe("redis");
    }

    const blocked = await checkRateLimitDistributed(id, 5, 60_000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
  });

  it("shares one budget across separate callers — the whole point of Redis", async () => {
    // Simulates two server instances: same Redis, same key, independent calls.
    const id = `user-${Date.now()}-b`;
    await checkRateLimitDistributed(id, 3, 60_000);
    await checkRateLimitDistributed(id, 3, 60_000);
    const third = await checkRateLimitDistributed(id, 3, 60_000);
    const fourth = await checkRateLimitDistributed(id, 3, 60_000);

    expect(third.allowed).toBe(true);
    // With the old per-process limiter each instance kept its own tally, so
    // this fourth call would have been allowed and the effective limit
    // silently multiplied by the replica count.
    expect(fourth.allowed).toBe(false);
  });

  it("counts each identifier independently", async () => {
    const a = `user-${Date.now()}-c`;
    const b = `user-${Date.now()}-d`;
    await checkRateLimitDistributed(a, 1, 60_000);

    const blockedA = await checkRateLimitDistributed(a, 1, 60_000);
    const allowedB = await checkRateLimitDistributed(b, 1, 60_000);

    expect(blockedA.allowed).toBe(false);
    expect(allowedB.allowed).toBe(true);
  });

  it("always sets a TTL, so a counter can never wedge permanently", async () => {
    // The failure this guards: INCR and EXPIRE as two commands can leave a key
    // with no expiry if the process dies between them, locking that user out
    // forever. The Lua script makes the pair atomic.
    const id = `user-${Date.now()}-e`;
    await checkRateLimitDistributed(id, 10, 5_000);

    const ttl = await getRedisClient().pttl(`ratelimit:${id}`);
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(5_000);
  });

  it("lets the window expire and the budget reset", async () => {
    const id = `user-${Date.now()}-f`;
    await checkRateLimitDistributed(id, 1, 300);
    expect((await checkRateLimitDistributed(id, 1, 300)).allowed).toBe(false);

    await new Promise((resolve) => setTimeout(resolve, 450));
    expect((await checkRateLimitDistributed(id, 1, 300)).allowed).toBe(true);
  });

  it("fails open to the in-memory limiter when Redis is unreachable", async () => {
    const original = process.env.REDIS_URL;
    await closeRedisClient();
    // Port 1 is reserved and never listening.
    process.env.REDIS_URL = "redis://127.0.0.1:1";

    const result = await checkRateLimitDistributed(`user-${Date.now()}-g`, 5, 60_000);

    // A rate limiter is protective, not an authorization control — taking the
    // admin API down because the cache blipped would be a worse outcome.
    expect(result.allowed).toBe(true);
    expect(result.backend).toBe("memory");

    await closeRedisClient();
    process.env.REDIS_URL = original;
  }, 20_000);
});

describe("in-memory fallback limiter", () => {
  beforeEach(() => __resetInMemoryRateLimit());

  it("blocks past the limit within the window", () => {
    const id = "mem-user";
    for (let i = 0; i < 3; i++) expect(checkRateLimit(id, 3, 60_000).allowed).toBe(true);
    expect(checkRateLimit(id, 3, 60_000).allowed).toBe(false);
  });

  it("reports the memory backend so callers can tell it apart from a real distributed decision", () => {
    expect(checkRateLimit("mem-user-2", 5, 60_000).backend).toBe("memory");
  });
});
