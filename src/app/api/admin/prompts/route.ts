import { NextRequest } from "next/server";
import { z } from "zod";
import { formatApiResponse } from "@/shared/lib/security";
import { handleApiError } from "@/shared/lib/apiHandler";
import { requireCompanyAccess } from "@/shared/lib/tenant";
import { SupabasePromptRepository } from "@/core/infrastructure/database/supabase/SupabasePromptRepository";

const promptRepo = new SupabasePromptRepository();

const MODULE_NAMES = ["identity", "behavior", "sales", "knowledge", "security", "booking", "qualification", "fallback"] as const;

const UpsertPromptSchema = z.object({
  company_id: z.string().uuid(),
  module_name: z.enum(MODULE_NAMES),
  content: z.string().min(1).max(20000),
});

export async function GET(req: NextRequest) {
  try {
    const companyId = req.nextUrl.searchParams.get("companyId");
    if (!companyId) return formatApiResponse(null, 400, "companyId query parameter is required");

    await requireCompanyAccess(req, companyId, "read:prompts");

    const templates = await promptRepo.getPromptTemplates(companyId);
    return formatApiResponse(templates, 200, "Prompt templates retrieved successfully");
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = UpsertPromptSchema.parse(body);

    const access = await requireCompanyAccess(req, parsed.company_id, "write:prompts");

    const template = await promptRepo.upsertPromptTemplate(parsed.company_id, parsed.module_name, parsed.content, access.userId);
    return formatApiResponse(template, 200, "Prompt template saved successfully");
  } catch (error) {
    return handleApiError(error);
  }
}
