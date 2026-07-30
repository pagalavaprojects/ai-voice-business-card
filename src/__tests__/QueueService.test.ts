import { RedisMemoryServer } from "redis-memory-server";
import { QueueService } from "@/core/infrastructure/queue/QueueService";
import { closeRedisClient } from "@/core/infrastructure/cache/redisClient";

// Runs against a real Redis server binary — proves enqueue, a worker
// actually processing a job, retry-with-backoff on failure, and the dead
// letter queue (jobs that exhaust every attempt) all work against real
// BullMQ + real Redis, not mocked behavior.
describe("QueueService (against a real Redis server)", () => {
  let server: RedisMemoryServer;

  beforeAll(async () => {
    server = await RedisMemoryServer.create();
    const host = await server.getHost();
    const port = await server.getPort();
    process.env.REDIS_URL = `redis://${host}:${port}`;
  }, 30000);

  afterAll(async () => {
    await closeRedisClient();
    await server.stop();
  });

  it("enqueues a job and a worker actually processes it", async () => {
    const queue = new QueueService<{ to: string }>("test-email-queue-1");
    const processed: string[] = [];

    const worker = queue.startWorker(async (job) => {
      processed.push(job.data.to);
    });

    await queue.enqueue("SEND", { to: "visitor@example.com" });

    await new Promise((resolve) => worker.on("completed", resolve));

    expect(processed).toEqual(["visitor@example.com"]);

    await worker.close();
    await queue.close();
  }, 15000);

  it("retries a failing job with backoff and eventually lands it in the dead letter queue", async () => {
    const queue = new QueueService<{ n: number }>("test-fail-queue-1");
    let attempts = 0;

    const worker = queue.startWorker(async () => {
      attempts += 1;
      throw new Error("simulated permanent failure");
    });

    await queue.enqueue("WILL_FAIL", { n: 1 }, { attempts: 2, backoff: { type: "fixed", delay: 50 } });

    await new Promise((resolve) => worker.on("failed", resolve));
    // Second (final) attempt
    await new Promise((resolve) => worker.on("failed", resolve));

    expect(attempts).toBe(2);

    const deadLetter = await queue.getFailedJobs();
    expect(deadLetter.length).toBe(1);
    expect(deadLetter[0].failedReason).toContain("simulated permanent failure");
    expect(deadLetter[0].attemptsMade).toBe(2);

    await worker.close();
    await queue.close();
  }, 15000);

  it("reports pending job count accurately before a job is processed", async () => {
    const queue = new QueueService<{ x: number }>("test-pending-queue-1");
    await queue.enqueue("JOB", { x: 1 }, { delay: 10000 }); // delayed so it stays pending for this assertion

    const count = await queue.getPendingJobsCount();
    expect(count).toBeGreaterThanOrEqual(1);

    await queue.close();
  });
});
