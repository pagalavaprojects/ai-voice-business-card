import { NextRequest } from "next/server";
import { z } from "zod";
import { formatApiResponse } from "@/shared/lib/security";
import { handleApiError } from "@/shared/lib/apiHandler";
import { requireCompanyAccess } from "@/shared/lib/tenant";
import { SupabaseKnowledgeRepository } from "@/core/infrastructure/database/supabase/SupabaseKnowledgeRepository";
import { SupabasePromptRepository } from "@/core/infrastructure/database/supabase/SupabasePromptRepository";
import { PromptAssemblyService } from "@/core/application/services/PromptAssemblyService";

const knowledgeRepo = new SupabaseKnowledgeRepository();
const promptRepo = new SupabasePromptRepository();
const promptAssemblyService = new PromptAssemblyService(knowledgeRepo, promptRepo);

const PreviewSchema = z.object({
  company_id: z.string().uuid(),
  employee_id: z.string().uuid(),
  module_name: z.string().optional(),
  draft_content: z.string().optional(),
});

/** Renders the full assembled system prompt with the current unsaved
 * draft substituted in for one module, so a user can see the real,
 * complete effect of an edit before saving it — not just the raw
 * template text in isolation. */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = PreviewSchema.parse(body);

    await requireCompanyAccess(req, parsed.company_id, "write:prompts");

    const prompt = await promptAssemblyService.assembleSystemPrompt(
      parsed.company_id,
      parsed.employee_id,
      parsed.module_name && parsed.draft_content !== undefined
        ? { moduleName: parsed.module_name, content: parsed.draft_content }
        : undefined
    );

    return formatApiResponse({ prompt }, 200, "Preview generated successfully");
  } catch (error) {
    return handleApiError(error);
  }
}
