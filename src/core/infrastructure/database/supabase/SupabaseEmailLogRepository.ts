import { IEmailLogRepository } from "@/core/domain/repositories/IEmailLogRepository";
import { EmailLog, EmailStatus } from "@/core/domain/models/types";
import { supabaseAdmin } from "@/shared/lib/supabase";

export class SupabaseEmailLogRepository implements IEmailLogRepository {
  async createLog(companyId: string | null, toEmail: string, subject: string, templateName: string): Promise<EmailLog> {
    const { data, error } = await supabaseAdmin
      .from("email_logs")
      .insert({ company_id: companyId, to_email: toEmail, subject, template_name: templateName, status: "QUEUED", attempt_count: 0 })
      .select()
      .single();

    if (error) throw new Error(`SupabaseEmailLogRepository.createLog failed: ${error.message}`);
    return data as EmailLog;
  }

  async updateLog(
    id: string,
    status: EmailStatus,
    data: { providerMessageId?: string; errorMessage?: string; attemptCount: number }
  ): Promise<EmailLog> {
    const { data: row, error } = await supabaseAdmin
      .from("email_logs")
      .update({
        status,
        provider_message_id: data.providerMessageId,
        error_message: data.errorMessage,
        attempt_count: data.attemptCount,
        sent_at: status === "SENT" ? new Date().toISOString() : undefined,
      })
      .eq("id", id)
      .select()
      .single();

    if (error) throw new Error(`SupabaseEmailLogRepository.updateLog failed: ${error.message}`);
    return row as EmailLog;
  }

  async listLogs(companyId: string, limit = 50): Promise<EmailLog[]> {
    const { data, error } = await supabaseAdmin
      .from("email_logs")
      .select()
      .eq("company_id", companyId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) throw new Error(`SupabaseEmailLogRepository.listLogs failed: ${error.message}`);
    return (data as EmailLog[]) || [];
  }
}
