import { QueueService } from "./QueueService";
import { SupabaseCRMRepository } from "../database/supabase/SupabaseCRMRepository";
import { CreateLeadDTO } from "@/core/domain/models/types";

export class CRMQueue {
  private queueService = new QueueService();
  private crmRepo = new SupabaseCRMRepository();

  async enqueueLeadSync(leadData: CreateLeadDTO) {
    return this.queueService.enqueue("CRM_LEAD_SYNC", leadData);
  }

  async processNextLeadSync() {
    const job = await this.queueService.processNextJob();
    if (!job) return null;

    const leadData = job.data as CreateLeadDTO;
    return this.crmRepo.createLead(leadData);
  }
}
