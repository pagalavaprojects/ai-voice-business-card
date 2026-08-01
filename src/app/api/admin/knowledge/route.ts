import { NextRequest } from "next/server";
import { formatApiResponse } from "@/shared/lib/security";
import { handleApiError } from "@/shared/lib/apiHandler";
import { requireCompanyAccess } from "@/shared/lib/tenant";
import { SupabaseKnowledgeDocumentRepository } from "@/core/infrastructure/database/supabase/SupabaseKnowledgeDocumentRepository";
import { SupabaseStorageAdapter } from "@/core/infrastructure/storage/SupabaseStorageAdapter";
import { inferSourceType, parseDocumentText } from "@/core/infrastructure/knowledge/DocumentParser";
import { KnowledgeStatus } from "@/core/domain/models/types";
import { KnowledgeIndexingQueue } from "@/core/infrastructure/queue/KnowledgeIndexingQueue";
import { isBackgroundWorkerEnabled } from "@/core/infrastructure/cache/redisClient";

const knowledgeRepo = new SupabaseKnowledgeDocumentRepository();
const storage = new SupabaseStorageAdapter();

const MAX_FILE_BYTES = 15 * 1024 * 1024; // 15MB

// Parsing, chunking and embedding a large PDF makes several sequential OpenAI
// calls and comfortably exceeds Vercel's 10s default when no worker is running
// to take it off the request path. 60s is the Hobby ceiling and is honoured on
// Pro too, so this is safe on either plan.
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  try {
    const companyId = req.nextUrl.searchParams.get("companyId");
    if (!companyId) return formatApiResponse(null, 400, "companyId query parameter is required");

    await requireCompanyAccess(req, companyId, "read:knowledge");

    const limit = Math.min(Number(req.nextUrl.searchParams.get("limit")) || 50, 100);
    const offset = Number(req.nextUrl.searchParams.get("offset")) || 0;
    const status = (req.nextUrl.searchParams.get("status") as KnowledgeStatus | null) ?? undefined;

    const result = await knowledgeRepo.listDocuments({ company_id: companyId, status, limit, offset });
    return formatApiResponse(result, 200, "Knowledge documents retrieved successfully");
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const companyId = formData.get("companyId");
    const file = formData.get("file");

    if (typeof companyId !== "string") return formatApiResponse(null, 400, "companyId is required");
    if (!(file instanceof File)) return formatApiResponse(null, 400, "file is required");
    if (file.size === 0) return formatApiResponse(null, 400, "File is empty");
    if (file.size > MAX_FILE_BYTES) return formatApiResponse(null, 413, "File exceeds the 15MB upload limit");

    const access = await requireCompanyAccess(req, companyId, "write:knowledge");

    const sourceType = inferSourceType(file.name, file.type);
    if (!sourceType) return formatApiResponse(null, 400, "Unsupported file type. Use PDF, DOCX, TXT, or Markdown.");

    const buffer = Buffer.from(await file.arrayBuffer());

    await storage.ensureBucket("knowledge-documents", false);
    const storagePath = `${companyId}/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    await storage.upload("knowledge-documents", storagePath, buffer, file.type || "application/octet-stream");

    const document = await knowledgeRepo.createDocument(companyId, file.name, sourceType, storagePath, file.size, access.userId);

    // Chunking + embedding is slow enough to risk a serverless request
    // timeout on a large PDF, so hand it to a background worker when one is
    // genuinely running and return immediately with status PENDING.
    //
    // Gated on WORKER_ENABLED rather than REDIS_URL: Redis is independently
    // useful for caching and rate limiting, so it is perfectly reasonable to
    // configure it on Vercel — which cannot run a long-lived worker. Keying
    // off Redis alone would enqueue into a queue nobody drains, leaving every
    // upload stuck at PENDING while the request reported success. Falling
    // back to the synchronous path is slower but always completes.
    if (isBackgroundWorkerEnabled()) {
      const indexingQueue = new KnowledgeIndexingQueue();
      await indexingQueue.enqueueIndexing(document.id);

      return formatApiResponse(
        { document, indexResult: { chunkCount: 0, embedded: false, queued: true } },
        201,
        "Document uploaded — indexing in the background"
      );
    }

    const rawText = await parseDocumentText(buffer, sourceType);
    const indexResult = await knowledgeRepo.indexDocument(document, rawText);
    const finalDocument = await knowledgeRepo.getDocumentById(document.id);

    return formatApiResponse(
      { document: finalDocument, indexResult },
      201,
      indexResult.embedded
        ? "Document uploaded and indexed successfully"
        : `Document uploaded but not fully indexed: ${indexResult.error}`
    );
  } catch (error) {
    return handleApiError(error);
  }
}
