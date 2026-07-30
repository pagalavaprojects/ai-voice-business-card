import { Logger } from "@/shared/lib/logger";

export interface QueueJob<T = unknown> {
  id: string;
  name: string;
  data: T;
  createdAt: string;
}

export class QueueService {
  private jobs: QueueJob[] = [];

  async enqueue<T>(jobName: string, payload: T): Promise<QueueJob<T>> {
    const job: QueueJob<T> = {
      id: `job_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      name: jobName,
      data: payload,
      createdAt: new Date().toISOString(),
    };
    this.jobs.push(job as QueueJob);
    Logger.info(`[QueueService] Job enqueued [${jobName}]`, { jobId: job.id });
    return job;
  }

  async processNextJob(): Promise<QueueJob | null> {
    const job = this.jobs.shift();
    if (job) {
      Logger.info(`[QueueService] Processing job [${job.name}]`, { jobId: job.id });
    }
    return job || null;
  }

  getPendingJobsCount(): number {
    return this.jobs.length;
  }
}
