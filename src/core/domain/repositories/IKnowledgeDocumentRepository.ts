import { KnowledgeChunk, KnowledgeDocument, KnowledgeSourceType } from "../models/types";

export interface KnowledgeDocumentFilter {
  company_id: string;
  limit?: number;
  offset?: number;
}

export interface IndexResult {
  chunkCount: number;
  embedded: boolean;
  error?: string;
}

export interface IKnowledgeDocumentRepository {
  createDocument(
    companyId: string,
    title: string,
    sourceType: KnowledgeSourceType,
    storagePath: string,
    fileSizeBytes: number,
    uploadedBy?: string
  ): Promise<KnowledgeDocument>;
  getDocumentById(id: string): Promise<KnowledgeDocument | null>;
  listDocuments(filter: KnowledgeDocumentFilter): Promise<{ documents: KnowledgeDocument[]; total: number }>;
  softDeleteDocument(id: string): Promise<boolean>;
  /** Runs parse -> chunk -> embed and persists chunks + document status. */
  indexDocument(document: KnowledgeDocument, rawText: string): Promise<IndexResult>;
  replaceChunks(documentId: string, companyId: string, chunks: Array<{ content: string; embedding: number[] | null; tokenCount: number }>): Promise<void>;
  searchByVector(companyId: string, queryEmbedding: number[], limit?: number): Promise<KnowledgeChunk[]>;
  searchByText(companyId: string, query: string, limit?: number): Promise<KnowledgeChunk[]>;
}
