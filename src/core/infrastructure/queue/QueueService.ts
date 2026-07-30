import { Queue, Worker, QueueEvents, Job, JobsOptions } from "bullmq";
import type Redis from "ioredis";
import { createBullMQConnection, isRedisConfigured, RedisUnavailableError } from "@/core/infrastructure/cache/redisClient";
import { Logger } from "@/shared/lib/logger";

export interface QueueJob<T = unknown> {
  id: string;
  name: string;
  data: T;
  createdAt: string;
}

const DEFAULT_JOB_OPTIONS: JobsOptions = {
  attempts: 4,
  backoff: { type: "exponential", delay: 1000 },
  removeOnComplete: { age: 3600, count: 1000 },
  // Failed jobs are kept (not removed) so they're inspectable as the dead
  // letter queue via getFailedJobs(), rather than being silently dropped.
  removeOnFail: false,
};

/**
 * Real BullMQ-backed queue (replaces the in-memory array the prior audit
 * flagged — jobs vanished on every restart/serverless cold start and
 * never coordinated across more than one server instance). Requires a
 * real Redis connection; unlike the third-party API adapters, there is no
 * fake fallback, because a job silently "processing" without ever
 * persisting or retrying is the exact bug this replaces.
 *
 * Every BullMQ construct (Queue, Worker) gets its own dedicated
 * connection via createBullMQConnection() rather than sharing one client —
 * a Worker's blocking read-for-new-jobs command can starve every other
 * Redis operation sharing that connection. This was found by testing
 * against a real Redis server (not a mock): an earlier version of this
 * file shared one client across everything and deadlocked under test.
 *
 * The underlying BullMQ `Queue`/`Worker` are typed loosely (`Queue`, not
 * `Queue<T>`) on purpose: BullMQ v6's typed-job-name generics
 * (ExtractNameType/ExtractDataType) are built for a queue declared with a
 * fixed, literal union of job names, not a generic wrapper class
 * parameterized by an arbitrary caller-supplied job name string. This
 * class's own public methods stay fully typed by `T`.
 */
export class QueueService<T = unknown> {
  private queue: Queue;
  private queueConnection: Redis;
  private queueName: string;
  private workerConnections: Redis[] = [];

  constructor(queueName: string) {
    if (!isRedisConfigured()) throw new RedisUnavailableError();
    this.queueName = queueName;
    this.queueConnection = createBullMQConnection();
    this.queue = new Queue(queueName, { connection: this.queueConnection });
  }

  async enqueue(jobName: string, payload: T, options?: JobsOptions): Promise<QueueJob<T>> {
    const job = await this.queue.add(jobName, payload, { ...DEFAULT_JOB_OPTIONS, ...options });
    Logger.info(`[QueueService:${this.queueName}] Job enqueued [${jobName}]`, { jobId: job.id });
    return { id: job.id ?? "", name: jobName, data: payload, createdAt: new Date().toISOString() };
  }

  /** Starts a worker that processes jobs until `close()` is called.
   * Real production deployments run this in a separate worker process
   * (see scripts/worker.ts, kubernetes/base/worker-deployment.yaml) —
   * exposed here so it can also be driven from a test. */
  startWorker(processor: (job: Job<T>) => Promise<void>, concurrency = 5): Worker<T> {
    const connection = createBullMQConnection();
    this.workerConnections.push(connection);

    const worker = new Worker(
      this.queueName,
      async (job: Job<T>) => {
        await processor(job);
      },
      { connection, concurrency }
    );

    worker.on("failed", (job, err) => {
      Logger.error(`[QueueService:${this.queueName}] Job failed`, { jobId: job?.id, attempts: job?.attemptsMade, error: err.message });
    });

    return worker as unknown as Worker<T>;
  }

  async getPendingJobsCount(): Promise<number> {
    const counts = await this.queue.getJobCounts("waiting", "delayed", "active");
    return (counts.waiting || 0) + (counts.delayed || 0) + (counts.active || 0);
  }

  /** The dead-letter queue: jobs that exhausted every retry attempt. */
  async getFailedJobs(): Promise<Array<{ id: string; name: string; failedReason: string; attemptsMade: number }>> {
    const jobs = await this.queue.getFailed();
    return jobs.map((j) => ({ id: j.id ?? "", name: j.name, failedReason: j.failedReason, attemptsMade: j.attemptsMade }));
  }

  getQueueEvents(): QueueEvents {
    return new QueueEvents(this.queueName, { connection: createBullMQConnection() });
  }

  async close(): Promise<void> {
    await this.queue.close();
    await this.queueConnection.quit();
    await Promise.all(this.workerConnections.map((c) => c.quit()));
    this.workerConnections = [];
  }
}
