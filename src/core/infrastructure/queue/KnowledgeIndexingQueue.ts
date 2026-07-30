import { QueueService } from "./QueueService";
import { SupabaseKnowledgeDocumentRepository } from "../database/supabase/SupabaseKnowledgeDocumentRepository";
import { SupabaseStorageAdapter } from "../storage/SupabaseStorageAdapter";
import { parseDocumentText } from "../knowledge/DocumentParser";
import { Logger } from "@/shared/lib/logger";

export interface IndexingJobPayload {
  documentId: string;
}

/**
 * Chunking + embedding a large PDF is genuinely slow (network round trips
 * to OpenAI per batch, CPU-bound PDF parsing) and was previously run
 * synchronously inside the upload API route, blocking the HTTP response
 * until the whole pipeline finished — a real timeout risk on any
 * serverless deployment with a request time limit. This queue moves that
 * work to a background worker; the upload route now enqueues and returns
 * immediately with status PENDING, and the dashboard already polls/shows
 * document status (PENDING/CHUNKING/EMBEDDING/READY/FAILED) from Phase 5.
 */
export class KnowledgeIndexingQueue {
  private queueService = new QueueService<IndexingJobPayload>("knowledge-indexing");
  private knowledgeRepo = new SupabaseKnowledgeDocumentRepository();
  private storage = new SupabaseStorageAdapter();

  async enqueueIndexing(documentId: string) {
    return this.queueService.enqueue("INDEX_DOCUMENT", { documentId });
  }

  async getPendingCount(): Promise<number> {
    return this.queueService.getPendingJobsCount();
  }

  async getDeadLetterJobs() {
    return this.queueService.getFailedJobs();
  }

  startWorker() {
    return this.queueService.startWorker(async (job) => {
      const document = await this.knowledgeRepo.getDocumentById(job.data.documentId);
      if (!document) {
        Logger.warn("KnowledgeIndexingQueue: document not found, skipping", { documentId: job.data.documentId });
        return;
      }

      const signedUrl = await this.storage.getSignedUrl("knowledge-documents", document.storage_path, 60);
      const response = await fetch(signedUrl);
      if (!response.ok) throw new Error(`Failed to download document for indexing: ${response.status}`);

      const buffer = Buffer.from(await response.arrayBuffer());
      const rawText = await parseDocumentText(buffer, document.source_type);
      await this.knowledgeRepo.indexDocument(document, rawText);
    });
  }
}
