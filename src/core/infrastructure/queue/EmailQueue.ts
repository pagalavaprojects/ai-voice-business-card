import { QueueService } from "./QueueService";
import { ResendEmailAdapter, SendEmailOptions } from "../email/ResendEmailAdapter";
import { SupabaseEmailLogRepository } from "../database/supabase/SupabaseEmailLogRepository";

export interface EmailJobPayload extends SendEmailOptions {
  emailLogId: string;
}

/** Real BullMQ queue for email delivery. This is deliberately a second,
 * independent path from NotificationService (Phase 14): NotificationService
 * retries inline and is used for time-sensitive, voice-call-triggered
 * sends where the caller needs a result before responding. This queue is
 * for reprocessing email_logs rows already marked FAILED — decoupled
 * background retry with BullMQ's own backoff/attempts/dead-letter
 * handling, not app-level retry inside a single request. */
export class EmailQueue {
  private queueService = new QueueService<EmailJobPayload>("email-delivery");
  private emailAdapter = new ResendEmailAdapter();
  private emailLogRepo = new SupabaseEmailLogRepository();

  async enqueueEmail(options: SendEmailOptions, emailLogId: string) {
    return this.queueService.enqueue("SEND_EMAIL", { ...options, emailLogId });
  }

  async getPendingCount(): Promise<number> {
    return this.queueService.getPendingJobsCount();
  }

  async getDeadLetterJobs() {
    return this.queueService.getFailedJobs();
  }

  async close(): Promise<void> {
    await this.queueService.close();
  }

  /** Starts the worker that actually sends queued emails. Run this in a
   * separate process (see scripts/worker.ts) — Next.js API routes are
   * request/response, not long-running processes. */
  startWorker() {
    return this.queueService.startWorker(async (job) => {
      const { emailLogId, ...emailOptions } = job.data;
      try {
        const result = await this.emailAdapter.sendEmail(emailOptions);
        await this.emailLogRepo.updateLog(emailLogId, "SENT", { providerMessageId: result.id, attemptCount: job.attemptsMade + 1 });
      } catch (err) {
        await this.emailLogRepo.updateLog(emailLogId, "FAILED", {
          errorMessage: err instanceof Error ? err.message : String(err),
          attemptCount: job.attemptsMade + 1,
        });
        throw err; // re-throw so BullMQ counts this attempt as failed and retries per DEFAULT_JOB_OPTIONS
      }
    });
  }
}
