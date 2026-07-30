import {
  IKnowledgeDocumentRepository,
  IndexResult,
  KnowledgeDocumentFilter,
} from "@/core/domain/repositories/IKnowledgeDocumentRepository";
import { KnowledgeChunk, KnowledgeDocument, KnowledgeSourceType } from "@/core/domain/models/types";
import { supabaseAdmin } from "@/shared/lib/supabase";
import { chunkText } from "@/core/infrastructure/knowledge/TextChunker";
import { OpenAIEmbeddingAdapter } from "@/core/infrastructure/embeddings/OpenAIEmbeddingAdapter";

export class SupabaseKnowledgeDocumentRepository implements IKnowledgeDocumentRepository {
  constructor(private embeddingAdapter: OpenAIEmbeddingAdapter = new OpenAIEmbeddingAdapter()) {}

  async createDocument(
    companyId: string,
    title: string,
    sourceType: KnowledgeSourceType,
    storagePath: string,
    fileSizeBytes: number,
    uploadedBy?: string
  ): Promise<KnowledgeDocument> {
    const { data, error } = await supabaseAdmin
      .from("knowledge_documents")
      .insert({
        company_id: companyId,
        title,
        source_type: sourceType,
        storage_path: storagePath,
        file_size_bytes: fileSizeBytes,
        status: "PENDING",
        uploaded_by: uploadedBy,
      })
      .select()
      .single();

    if (error) throw new Error(`SupabaseKnowledgeDocumentRepository.createDocument failed: ${error.message}`);
    return data as KnowledgeDocument;
  }

  async getDocumentById(id: string): Promise<KnowledgeDocument | null> {
    const { data, error } = await supabaseAdmin.from("knowledge_documents").select().eq("id", id).is("deleted_at", null).maybeSingle();
    if (error) throw new Error(`SupabaseKnowledgeDocumentRepository.getDocumentById failed: ${error.message}`);
    return (data as KnowledgeDocument) || null;
  }

  async listDocuments(filter: KnowledgeDocumentFilter): Promise<{ documents: KnowledgeDocument[]; total: number }> {
    const limit = filter.limit || 50;
    const offset = filter.offset || 0;

    const { data, count, error } = await supabaseAdmin
      .from("knowledge_documents")
      .select("*", { count: "exact" })
      .eq("company_id", filter.company_id)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw new Error(`SupabaseKnowledgeDocumentRepository.listDocuments failed: ${error.message}`);
    return { documents: (data as KnowledgeDocument[]) || [], total: count || 0 };
  }

  async softDeleteDocument(id: string): Promise<boolean> {
    const { error } = await supabaseAdmin.from("knowledge_documents").update({ deleted_at: new Date().toISOString() }).eq("id", id);
    if (error) throw new Error(`SupabaseKnowledgeDocumentRepository.softDeleteDocument failed: ${error.message}`);
    return true;
  }

  async indexDocument(document: KnowledgeDocument, rawText: string): Promise<IndexResult> {
    await supabaseAdmin.from("knowledge_documents").update({ status: "CHUNKING" }).eq("id", document.id);

    const chunks = chunkText(rawText);
    if (chunks.length === 0) {
      await supabaseAdmin
        .from("knowledge_documents")
        .update({ status: "FAILED", error_message: "Document contained no extractable text", chunk_count: 0 })
        .eq("id", document.id);
      return { chunkCount: 0, embedded: false, error: "Document contained no extractable text" };
    }

    if (!this.embeddingAdapter.isConfigured()) {
      // Store the chunks now so search/reindex are meaningful once a real
      // key is configured, but be explicit that similarity search won't
      // work yet — this is the honest alternative to fabricating vectors.
      await this.replaceChunks(document.id, document.company_id, chunks.map((content) => ({ content, embedding: null, tokenCount: null as unknown as number })));
      await supabaseAdmin
        .from("knowledge_documents")
        .update({
          status: "FAILED",
          error_message: "OPENAI_API_KEY not configured — chunks stored but not embedded. Requires live infrastructure.",
          chunk_count: chunks.length,
        })
        .eq("id", document.id);
      return { chunkCount: chunks.length, embedded: false, error: "OPENAI_API_KEY not configured" };
    }

    await supabaseAdmin.from("knowledge_documents").update({ status: "EMBEDDING" }).eq("id", document.id);

    try {
      const embeddings = await this.embeddingAdapter.embed(chunks);
      await this.replaceChunks(
        document.id,
        document.company_id,
        chunks.map((content, i) => ({ content, embedding: embeddings[i], tokenCount: Math.ceil(content.length / 4) }))
      );
      await supabaseAdmin.from("knowledge_documents").update({ status: "READY", chunk_count: chunks.length, error_message: null }).eq("id", document.id);
      return { chunkCount: chunks.length, embedded: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Embedding generation failed";
      await supabaseAdmin.from("knowledge_documents").update({ status: "FAILED", error_message: message }).eq("id", document.id);
      return { chunkCount: chunks.length, embedded: false, error: message };
    }
  }

  async replaceChunks(
    documentId: string,
    companyId: string,
    chunks: Array<{ content: string; embedding: number[] | null; tokenCount: number }>
  ): Promise<void> {
    const { error: deleteError } = await supabaseAdmin.from("knowledge_chunks").delete().eq("knowledge_document_id", documentId);
    if (deleteError) throw new Error(`SupabaseKnowledgeDocumentRepository.replaceChunks failed: ${deleteError.message}`);

    if (chunks.length === 0) return;

    const { error: insertError } = await supabaseAdmin.from("knowledge_chunks").insert(
      chunks.map((c, i) => ({
        knowledge_document_id: documentId,
        company_id: companyId,
        chunk_index: i,
        content: c.content,
        embedding: c.embedding,
        token_count: c.tokenCount,
      }))
    );

    if (insertError) throw new Error(`SupabaseKnowledgeDocumentRepository.replaceChunks failed: ${insertError.message}`);
  }

  async searchByVector(companyId: string, queryEmbedding: number[], limit = 8): Promise<KnowledgeChunk[]> {
    const { data, error } = await supabaseAdmin.rpc("match_knowledge_chunks", {
      target_company_id: companyId,
      query_embedding: queryEmbedding,
      match_count: limit,
    });

    if (error) throw new Error(`SupabaseKnowledgeDocumentRepository.searchByVector failed: ${error.message}`);
    return (data as KnowledgeChunk[]) || [];
  }

  /** Fallback used when OPENAI_API_KEY isn't configured — plain ILIKE
   * search across chunk content. Real and functional, just less precise
   * than vector similarity search. */
  async searchByText(companyId: string, query: string, limit = 8): Promise<KnowledgeChunk[]> {
    const term = query.replace(/[%_]/g, "");
    const { data, error } = await supabaseAdmin
      .from("knowledge_chunks")
      .select()
      .eq("company_id", companyId)
      .ilike("content", `%${term}%`)
      .limit(limit);

    if (error) throw new Error(`SupabaseKnowledgeDocumentRepository.searchByText failed: ${error.message}`);
    return (data as KnowledgeChunk[]) || [];
  }
}
