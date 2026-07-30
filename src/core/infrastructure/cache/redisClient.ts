import Redis from "ioredis";
import { isPlaceholderCredential } from "@/shared/lib/security";

export class RedisUnavailableError extends Error {
  constructor() {
    super("REDIS_URL is not configured — Redis-backed caching/queues require live infrastructure");
    this.name = "RedisUnavailableError";
  }
}

let client: Redis | null = null;

export function isRedisConfigured(): boolean {
  return !isPlaceholderCredential(process.env.REDIS_URL);
}

/** Single shared ioredis connection for plain cache reads/writes
 * (RedisCache). Unlike the third-party adapters (Resend, Cal.com, OpenAI)
 * there is no demo fallback here — an in-memory cache silently pretending
 * to be Redis is exactly the bug the prior audit flagged, so this throws
 * a typed, catchable error instead when Redis isn't configured. */
export function getRedisClient(): Redis {
  if (!isRedisConfigured()) throw new RedisUnavailableError();
  if (!client) {
    client = new Redis(process.env.REDIS_URL as string, {
      maxRetriesPerRequest: 3,
      lazyConnect: false,
    });
  }
  return client;
}

/**
 * BullMQ Workers issue blocking Redis commands (effectively BRPOPLPUSH)
 * to wait for new jobs, and BullMQ's own docs require any connection used
 * for that to be created with `maxRetriesPerRequest: null` and its own
 * dedicated socket — sharing the general-purpose client above across a
 * Queue/Worker/QueueEvents would let a Worker's blocking read starve
 * every other Redis operation on that same connection (this was found by
 * testing against a real Redis server, not a mock: the shared-client
 * version of this file deadlocked QueueService's own tests). Every
 * BullMQ construct gets its own fresh connection.
 */
export function createBullMQConnection(): Redis {
  if (!isRedisConfigured()) throw new RedisUnavailableError();
  return new Redis(process.env.REDIS_URL as string, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
  });
}

export async function closeRedisClient(): Promise<void> {
  if (client) {
    await client.quit();
    client = null;
  }
}
