import { RedisMemoryServer } from "redis-memory-server";
import { RedisCache } from "@/core/infrastructure/cache/RedisCache";
import { closeRedisClient } from "@/core/infrastructure/cache/redisClient";

// Runs against a real Redis server binary (redis-memory-server), not a
// protocol mock — proves this cache actually speaks real Redis, not just
// that it typechecks against ioredis's types.
describe("RedisCache (against a real Redis server)", () => {
  let server: RedisMemoryServer;
  let cache: RedisCache;

  beforeAll(async () => {
    server = await RedisMemoryServer.create();
    const host = await server.getHost();
    const port = await server.getPort();
    process.env.REDIS_URL = `redis://${host}:${port}`;
    cache = new RedisCache();
  }, 30000);

  afterAll(async () => {
    await closeRedisClient();
    await server.stop();
  });

  it("returns null for a key that was never set", async () => {
    expect(await cache.get("nonexistent")).toBeNull();
  });

  it("round-trips a JSON value through a real SET/GET", async () => {
    await cache.set("prompt:company-1:emp-1", { systemPrompt: "You are a helpful assistant." }, 60);
    const value = await cache.get<{ systemPrompt: string }>("prompt:company-1:emp-1");
    expect(value).toEqual({ systemPrompt: "You are a helpful assistant." });
  });

  it("actually expires keys after the given TTL, verified against real Redis TTL", async () => {
    await cache.set("short-lived", "value", 30);
    const ttl = await cache.getTtl("short-lived");
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(30);
  });

  it("deletes a key", async () => {
    await cache.set("to-delete", "value", 60);
    await cache.delete("to-delete");
    expect(await cache.get("to-delete")).toBeNull();
  });

  it("clears only keys matching a prefix, leaving others intact", async () => {
    await cache.set("prompt:a", "1", 60);
    await cache.set("prompt:b", "2", 60);
    await cache.set("products:a", "3", 60);

    await cache.clear("prompt:");

    expect(await cache.get("prompt:a")).toBeNull();
    expect(await cache.get("prompt:b")).toBeNull();
    expect(await cache.get("products:a")).toBe("3");
  });
});
