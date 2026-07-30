import { NextRequest } from "next/server";
import { formatApiResponse } from "@/shared/lib/security";
import { handleApiError } from "@/shared/lib/apiHandler";
import { requireCompanyAccess } from "@/shared/lib/tenant";
import { SupabaseKnowledgeDocumentRepository } from "@/core/infrastructure/database/supabase/SupabaseKnowledgeDocumentRepository";
import { OpenAIEmbeddingAdapter } from "@/core/infrastructure/embeddings/OpenAIEmbeddingAdapter";

const knowledgeRepo = new SupabaseKnowledgeDocumentRepository();
const embeddingAdapter = new OpenAIEmbeddingAdapter();

export async function GET(req: NextRequest) {
  try {
    const companyId = req.nextUrl.searchParams.get("companyId");
    const query = req.nextUrl.searchParams.get("q");
    if (!companyId) return formatApiResponse(null, 400, "companyId query parameter is required");
    if (!query || query.trim().length < 2) return formatApiResponse(null, 400, "q must be at least 2 characters");

    await requireCompanyAccess(req, companyId, "read:knowledge");

    if (embeddingAdapter.isConfigured()) {
      const [queryEmbedding] = await embeddingAdapter.embed([query]);
      const results = await knowledgeRepo.searchByVector(companyId, queryEmbedding);
      return formatApiResponse({ mode: "vector", results }, 200, "Search completed using vector similarity");
    }

    const results = await knowledgeRepo.searchByText(companyId, query);
    return formatApiResponse(
      { mode: "text", results },
      200,
      "Search completed using text fallback (OPENAI_API_KEY not configured for semantic search)"
    );
  } catch (error) {
    return handleApiError(error);
  }
}
