import { NextRequest } from "next/server";
import { z } from "zod";
import { formatApiResponse } from "@/shared/lib/security";
import { handleApiError } from "@/shared/lib/apiHandler";
import { requireCompanyAccess } from "@/shared/lib/tenant";
import { SupabaseKnowledgeDocumentRepository } from "@/core/infrastructure/database/supabase/SupabaseKnowledgeDocumentRepository";
import { SupabaseStorageAdapter } from "@/core/infrastructure/storage/SupabaseStorageAdapter";
import { parseDocumentText } from "@/core/infrastructure/knowledge/DocumentParser";

// Reads the session cookie and/or query params, so it can never be rendered
// statically. Declared explicitly to stop Next attempting a static pass that
// always throws "Dynamic server usage" — noise that buried real errors in the
// build log.
export const dynamic = "force-dynamic";


const knowledgeRepo = new SupabaseKnowledgeDocumentRepository();
const storage = new SupabaseStorageAdapter();

// Downloads the stored file, then re-chunks and re-embeds it — the same
// multi-call OpenAI work as the initial upload, so it needs the same headroom
// above Vercel's 10s default.
export const maxDuration = 60;

const ReindexSchema = z.object({ company_id: z.string().uuid() });

export async function POST(req: NextRequest, { params }: { params: { documentId: string } }) {
  try {
    const body = await req.json().catch(() => ({}));
    const parsed = ReindexSchema.parse(body);

    await requireCompanyAccess(req, parsed.company_id, "write:knowledge");

    const document = await knowledgeRepo.getDocumentById(params.documentId);
    if (!document || document.company_id !== parsed.company_id) return formatApiResponse(null, 404, "Document not found");

    const signedUrl = await storage.getSignedUrl("knowledge-documents", document.storage_path, 60);
    const fileResponse = await fetch(signedUrl);
    if (!fileResponse.ok) throw new Error(`Failed to download stored file for reindex: ${fileResponse.status}`);
    const buffer = Buffer.from(await fileResponse.arrayBuffer());

    const rawText = await parseDocumentText(buffer, document.source_type);
    const indexResult = await knowledgeRepo.indexDocument(document, rawText);

    const finalDocument = await knowledgeRepo.getDocumentById(document.id);
    return formatApiResponse({ document: finalDocument, indexResult }, 200, "Document reindexed");
  } catch (error) {
    return handleApiError(error);
  }
}
