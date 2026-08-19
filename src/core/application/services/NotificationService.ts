import { ResendEmailAdapter } from "@/core/infrastructure/email/ResendEmailAdapter";
import { IEmailLogRepository } from "@/core/domain/repositories/IEmailLogRepository";
import { withExponentialBackoff } from "@/shared/lib/resilience";
import { Logger } from "@/shared/lib/logger";

export interface NotificationRequest {
  companyId: string | null;
  to: string;
  subject: string;
  html: string;
  templateName: string;
  /** The company's configured sender name, resolved by the caller that already
   * holds its settings. Omitted falls back to the platform name. */
  fromName?: string;
}

/**
 * Wraps ResendEmailAdapter with the two things "send an email" needs to be
 * a real notification rather than a fire-and-forget call: every attempt is
 * logged to email_logs (queued -> sent/failed, with attempt count), and
 * transient failures are retried with exponential backoff via the
 * withExponentialBackoff helper — which existed in this codebase already
 * but, before this, was only ever exercised by its own unit test.
 */
export class NotificationService {
  constructor(
    private emailAdapter: ResendEmailAdapter,
    private emailLogRepo: IEmailLogRepository
  ) {}

  async send(request: NotificationRequest): Promise<{ success: boolean; error?: string }> {
    const log = await this.emailLogRepo.createLog(request.companyId, request.to, request.subject, request.templateName);

    let attemptCount = 0;
    try {
      const result = await withExponentialBackoff(
        async () => {
          attemptCount += 1;
          return this.emailAdapter.sendEmail({
            to: request.to,
            subject: request.subject,
            html: request.html,
            fromName: request.fromName,
            // One key per LOGICAL send (the email_logs row), stable across
            // every retry attempt inside this call: a first attempt whose
            // response was lost (timeout abort, connection reset) may have
            // been delivered anyway, and Resend dedupes on this key so the
            // retry can never email the recipient twice (2026-08-19 audit).
            idempotencyKey: `email-log-${log.id}`,
          });
        },
        { maxRetries: 2, initialDelayMs: 500, backoffFactor: 2 }
      );

      await this.emailLogRepo.updateLog(log.id, "SENT", { providerMessageId: result.id, attemptCount });
      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown email delivery error";
      await this.emailLogRepo.updateLog(log.id, "FAILED", { errorMessage: message, attemptCount });
      Logger.error("Notification delivery failed after retries", { to: request.to, templateName: request.templateName, error: message });
      return { success: false, error: message };
    }
  }
}
