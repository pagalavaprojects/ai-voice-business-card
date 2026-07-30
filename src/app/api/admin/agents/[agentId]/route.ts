import { NextRequest } from "next/server";
import { z } from "zod";
import { formatApiResponse } from "@/shared/lib/security";
import { handleApiError } from "@/shared/lib/apiHandler";
import { requireCompanyAccess } from "@/shared/lib/tenant";
import { SupabaseAgentRepository } from "@/core/infrastructure/database/supabase/SupabaseAgentRepository";
import { KNOWN_TOOL_NAMES } from "@/core/application/tools/ToolRegistry";

const agentRepo = new SupabaseAgentRepository();

const UpdateAgentSchema = z.object({
  company_id: z.string().uuid(),
  employee_id: z.string().uuid().optional().nullable(),
  name: z.string().min(2).optional(),
  avatar_url: z.string().url().optional().nullable(),
  voice_model_id: z.string().min(1).optional(),
  personality_prompt: z.string().min(10).optional(),
  capabilities: z.array(z.string()).optional(),
  tools: z.array(z.enum(KNOWN_TOOL_NAMES)).optional(),
  prompt_template_id: z.string().uuid().optional().nullable(),
  escalation_threshold: z.number().min(0).max(1).optional(),
  status: z.enum(["ACTIVE", "INACTIVE", "TESTING"]).optional(),
  knowledge_document_ids: z.array(z.string().uuid()).optional(),
});

export async function GET(req: NextRequest, { params }: { params: { agentId: string } }) {
  try {
    const companyId = req.nextUrl.searchParams.get("companyId");
    if (!companyId) return formatApiResponse(null, 400, "companyId query parameter is required");

    await requireCompanyAccess(req, companyId, "read:agents");

    const agent = await agentRepo.getAgentById(params.agentId);
    if (!agent || agent.company_id !== companyId) return formatApiResponse(null, 404, "Agent not found");

    const knowledgeDocumentIds = await agentRepo.getAssignedKnowledgeDocumentIds(agent.id);
    return formatApiResponse({ agent, knowledgeDocumentIds }, 200, "Agent retrieved successfully");
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PUT(req: NextRequest, { params }: { params: { agentId: string } }) {
  try {
    const body = await req.json();
    const parsed = UpdateAgentSchema.parse(body);

    await requireCompanyAccess(req, parsed.company_id, "write:agents");

    const existing = await agentRepo.getAgentById(params.agentId);
    if (!existing || existing.company_id !== parsed.company_id) return formatApiResponse(null, 404, "Agent not found");

    const { status, knowledge_document_ids, company_id: _companyId, ...updateFields } = parsed;
    let agent = existing;
    if (Object.keys(updateFields).length > 0) {
      agent = await agentRepo.updateAgent(params.agentId, updateFields);
    }
    if (status) {
      agent = await agentRepo.updateAgentStatus(params.agentId, status);
    }
    if (knowledge_document_ids) {
      await agentRepo.assignKnowledgeDocuments(params.agentId, knowledge_document_ids);
    }

    return formatApiResponse(agent, 200, "Agent updated successfully");
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { agentId: string } }) {
  try {
    const companyId = req.nextUrl.searchParams.get("companyId");
    if (!companyId) return formatApiResponse(null, 400, "companyId query parameter is required");

    await requireCompanyAccess(req, companyId, "delete:agents");

    const agent = await agentRepo.getAgentById(params.agentId);
    if (!agent || agent.company_id !== companyId) return formatApiResponse(null, 404, "Agent not found");

    await agentRepo.softDeleteAgent(params.agentId);
    return formatApiResponse(null, 200, "Agent deleted successfully");
  } catch (error) {
    return handleApiError(error);
  }
}
