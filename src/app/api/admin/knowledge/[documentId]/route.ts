import { NextRequest } from "next/server";
import { formatApiResponse } from "@/shared/lib/security";
import { handleApiError } from "@/shared/lib/apiHandler";
import { requireCompanyAccess } from "@/shared/lib/tenant";
import { SupabaseKnowledgeDocumentRepository } from "@/core/infrastructure/database/supabase/SupabaseKnowledgeDocumentRepository";
import { SupabaseStorageAdapter } from "@/core/infrastructure/storage/SupabaseStorageAdapter";

// Reads the session cookie and/or query params, so it can never be rendered
// statically. Declared explicitly to stop Next attempting a static pass that
// always throws "Dynamic server usage" — noise that buried real errors in the
// build log.
export const dynamic = "force-dynamic";


const knowledgeRepo = new SupabaseKnowledgeDocumentRepository();
const storage = new SupabaseStorageAdapter();

export async function DELETE(req: NextRequest, { params }: { params: { documentId: string } }) {
  try {
    const companyId = req.nextUrl.searchParams.get("companyId");
    if (!companyId) return formatApiResponse(null, 400, "companyId query parameter is required");

    await requireCompanyAccess(req, companyId, "delete:knowledge");

    const document = await knowledgeRepo.getDocumentById(params.documentId);
    if (!document || document.company_id !== companyId) return formatApiResponse(null, 404, "Document not found");

    await knowledgeRepo.softDeleteDocument(document.id);
    try {
      await storage.remove("knowledge-documents", document.storage_path);
    } catch {
      // Non-fatal: the DB row is soft-deleted regardless of storage cleanup succeeding.
    }

    return formatApiResponse(null, 200, "Document deleted successfully");
  } catch (error) {
    return handleApiError(error);
  }
}
