import { NextRequest } from "next/server";
import { z } from "zod";
import { formatApiResponse } from "@/shared/lib/security";
import { handleApiError } from "@/shared/lib/apiHandler";
import { requireCompanyAccess } from "@/shared/lib/tenant";
import { SupabasePromptRepository } from "@/core/infrastructure/database/supabase/SupabasePromptRepository";

const promptRepo = new SupabasePromptRepository();

const RollbackSchema = z.object({ company_id: z.string().uuid(), version: z.number().int().positive() });

export async function POST(req: NextRequest, { params }: { params: { templateId: string } }) {
  try {
    const body = await req.json();
    const parsed = RollbackSchema.parse(body);

    const access = await requireCompanyAccess(req, parsed.company_id, "write:prompts");

    const template = await promptRepo.getPromptTemplateById(params.templateId);
    if (!template || template.company_id !== parsed.company_id) return formatApiResponse(null, 404, "Prompt template not found");

    const rolledBack = await promptRepo.rollbackToVersion(params.templateId, parsed.version, access.userId);
    return formatApiResponse(rolledBack, 200, `Rolled back to version ${parsed.version}`);
  } catch (error) {
    return handleApiError(error);
  }
}
