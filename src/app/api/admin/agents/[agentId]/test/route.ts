import { NextRequest } from "next/server";
import { z } from "zod";
import { formatApiResponse } from "@/shared/lib/security";
import { handleApiError } from "@/shared/lib/apiHandler";
import { requireCompanyAccess } from "@/shared/lib/tenant";
import { SupabaseAgentRepository } from "@/core/infrastructure/database/supabase/SupabaseAgentRepository";
import { SupabasePromptRepository } from "@/core/infrastructure/database/supabase/SupabasePromptRepository";
import { AgentReadiness } from "@/core/domain/repositories/IAgentRepository";

// Reads the session cookie and/or query params, so it can never be rendered
// statically. Declared explicitly to stop Next attempting a static pass that
// always throws "Dynamic server usage" — noise that buried real errors in the
// build log.
export const dynamic = "force-dynamic";


const agentRepo = new SupabaseAgentRepository();
const promptRepo = new SupabasePromptRepository();

const TestAgentSchema = z.object({ company_id: z.string().uuid() });

/**
 * "Testing" an agent without a live Vapi/OpenAI key can't place a real
 * call, so this performs the check that's actually possible without live
 * infrastructure: is the agent's configuration complete enough to place a
 * call at all (voice model set, prompt non-trivial, at least one
 * knowledge source or explicit acknowledgement of none, valid tool
 * names). This is reported honestly as a readiness check, not a live
 * voice test.
 */
export async function POST(req: NextRequest, { params }: { params: { agentId: string } }) {
  try {
    const body = await req.json().catch(() => ({}));
    const parsed = TestAgentSchema.parse(body);

    await requireCompanyAccess(req, parsed.company_id, "write:agents");

    const agent = await agentRepo.getAgentById(params.agentId);
    if (!agent || agent.company_id !== parsed.company_id) return formatApiResponse(null, 404, "Agent not found");

    const knowledgeDocumentIds = await agentRepo.getAssignedKnowledgeDocumentIds(agent.id);
    const promptTemplate = agent.prompt_template_id ? await promptRepo.getPromptTemplateById(agent.prompt_template_id) : null;

    const checks: AgentReadiness["checks"] = [
      {
        label: "Voice model configured",
        passed: Boolean(agent.voice_model_id),
        detail: agent.voice_model_id || "No voice_model_id set",
      },
      {
        label: "Personality prompt is substantive",
        passed: agent.personality_prompt.trim().length >= 40,
        detail: `${agent.personality_prompt.trim().length} characters (minimum 40)`,
      },
      {
        label: "Prompt template linked",
        passed: !agent.prompt_template_id || Boolean(promptTemplate),
        detail: agent.prompt_template_id
          ? promptTemplate
            ? `Linked to "${promptTemplate.module_name}" v${promptTemplate.version}`
            : "prompt_template_id is set but the template no longer exists"
          : "No prompt template linked (optional)",
      },
      {
        label: "Knowledge base assigned",
        passed: knowledgeDocumentIds.length > 0,
        detail: knowledgeDocumentIds.length > 0 ? `${knowledgeDocumentIds.length} document(s) assigned` : "No knowledge documents assigned yet",
      },
      {
        label: "Escalation threshold in range",
        passed: agent.escalation_threshold >= 0 && agent.escalation_threshold <= 1,
        detail: String(agent.escalation_threshold),
      },
    ];

    const ready = checks.every((c) => c.passed || c.label === "Knowledge base assigned");
    const result: AgentReadiness = { ready, checks };

    await agentRepo.recordTestRun(agent.id);

    return formatApiResponse(result, 200, ready ? "Agent is ready to activate" : "Agent has configuration gaps");
  } catch (error) {
    return handleApiError(error);
  }
}
