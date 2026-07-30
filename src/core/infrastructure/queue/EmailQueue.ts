import { QueueService } from "./QueueService";
import { ResendEmailAdapter, SendEmailOptions } from "../email/ResendEmailAdapter";

export class EmailQueue {
  private queueService = new QueueService();
  private emailAdapter = new ResendEmailAdapter();

  async enqueueEmail(options: SendEmailOptions) {
    return this.queueService.enqueue("EMAIL_TRANSACTIONAL", options);
  }

  async processNextEmail(): Promise<{ id: string; success: boolean } | null> {
    const job = await this.queueService.processNextJob();
    if (!job) return null;

    const emailData = job.data as SendEmailOptions;
    return this.emailAdapter.sendEmail(emailData);
  }
}
