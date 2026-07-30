import { EmailLog, EmailStatus } from "../models/types";

export interface IEmailLogRepository {
  createLog(companyId: string | null, toEmail: string, subject: string, templateName: string): Promise<EmailLog>;
  updateLog(id: string, status: EmailStatus, data: { providerMessageId?: string; errorMessage?: string; attemptCount: number }): Promise<EmailLog>;
  listLogs(companyId: string, limit?: number): Promise<EmailLog[]>;
}
