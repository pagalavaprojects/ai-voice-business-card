/**
 * Background worker process: processes the real BullMQ queues (email
 * delivery, CRM lead sync, knowledge-document indexing). This is the
 * missing half of the queue system — enqueuing happens inside Next.js API
 * routes (request/response, short-lived), but BullMQ jobs need a
 * long-running process to actually execute. Run as its own container/pod
 * (see kubernetes/base/worker-deployment.yaml), separate from the web
 * server, so a slow embedding job never blocks HTTP request handling.
 *
 * Requires REDIS_URL to be a real, reachable Redis instance — there is
 * none in this development environment, so this script's queue
 * connections have been verified in isolation (RedisCache.test.ts,
 * QueueService.test.ts, all against a real Redis binary via
 * redis-memory-server) but this specific entry point has not been run
 * end-to-end against a live deployment. Requires Live Infrastructure to
 * confirm.
 */
import { EmailQueue } from "../src/core/infrastructure/queue/EmailQueue";
import { CRMQueue } from "../src/core/infrastructure/queue/CRMQueue";
import { KnowledgeIndexingQueue } from "../src/core/infrastructure/queue/KnowledgeIndexingQueue";
import { isRedisConfigured } from "../src/core/infrastructure/cache/redisClient";
import { Logger } from "../src/shared/lib/logger";

async function main() {
  if (!isRedisConfigured()) {
    Logger.error("Worker cannot start: REDIS_URL is not configured");
    process.exit(1);
  }

  const emailQueue = new EmailQueue();
  const crmQueue = new CRMQueue();
  const knowledgeQueue = new KnowledgeIndexingQueue();

  const workers = [emailQueue.startWorker(), crmQueue.startWorker(), knowledgeQueue.startWorker()];

  Logger.info("Worker process started", { queues: ["email-delivery", "crm-lead-sync", "knowledge-indexing"] });

  const shutdown = async () => {
    Logger.info("Worker process shutting down...");
    await Promise.all(workers.map((w) => w.close()));
    process.exit(0);
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

main().catch((err) => {
  Logger.error("Worker process crashed", { error: err instanceof Error ? err.message : String(err) });
  process.exit(1);
});
