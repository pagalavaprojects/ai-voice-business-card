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

/**
 * Whether a background worker process (scripts/worker.ts) is actually running
 * and able to drain the queues.
 *
 * Deliberately NOT inferred from REDIS_URL. Redis is useful on its own for
 * caching and distributed rate limiting, so it is entirely reasonable to
 * configure it on a serverless host — but Vercel cannot run a long-lived
 * worker process. Enqueuing on the strength of REDIS_URL alone means every
 * uploaded document is handed to a queue nobody drains and sits at PENDING
 * forever, with the request path reporting success.
 *
 * So this is an explicit opt-in: set WORKER_ENABLED=true only where a worker
 * is genuinely deployed (a container host, or `npm run worker` locally).
 * Defaulting to false makes the safe, synchronous path the default.
 */
export function isBackgroundWorkerEnabled(): boolean {
  return isRedisConfigured() && process.env.WORKER_ENABLED === "true";
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
