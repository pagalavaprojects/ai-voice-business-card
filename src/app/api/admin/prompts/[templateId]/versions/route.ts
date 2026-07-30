import { NextRequest } from "next/server";
import { formatApiResponse } from "@/shared/lib/security";
import { handleApiError } from "@/shared/lib/apiHandler";
import { requireCompanyAccess } from "@/shared/lib/tenant";
import { SupabasePromptRepository } from "@/core/infrastructure/database/supabase/SupabasePromptRepository";

const promptRepo = new SupabasePromptRepository();

export async function GET(req: NextRequest, { params }: { params: { templateId: string } }) {
  try {
    const companyId = req.nextUrl.searchParams.get("companyId");
    if (!companyId) return formatApiResponse(null, 400, "companyId query parameter is required");

    await requireCompanyAccess(req, companyId, "read:prompts");

    const template = await promptRepo.getPromptTemplateById(params.templateId);
    if (!template || template.company_id !== companyId) return formatApiResponse(null, 404, "Prompt template not found");

    const versions = await promptRepo.listVersions(params.templateId);
    return formatApiResponse({ current: template, versions }, 200, "Prompt versions retrieved successfully");
  } catch (error) {
    return handleApiError(error);
  }
}
