import { QueueService } from "./QueueService";
import { SupabaseCRMRepository } from "../database/supabase/SupabaseCRMRepository";
import { CreateLeadDTO } from "@/core/domain/models/types";

/** Real BullMQ queue for CRM lead sync, kept small and separate from the
 * synchronous save_lead tool path (a single insert is fast enough to stay
 * inline there) — this exists for bulk/deferred lead ingestion, e.g. a
 * future CSV import or an external-CRM webhook that shouldn't block its
 * own response on our insert succeeding. */
export class CRMQueue {
  private queueService = new QueueService<CreateLeadDTO>("crm-lead-sync");
  private crmRepo = new SupabaseCRMRepository();

  async enqueueLeadSync(leadData: CreateLeadDTO) {
    return this.queueService.enqueue("CRM_LEAD_SYNC", leadData);
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

  startWorker() {
    return this.queueService.startWorker(async (job) => {
      await this.crmRepo.createLead(job.data);
    });
  }
}
