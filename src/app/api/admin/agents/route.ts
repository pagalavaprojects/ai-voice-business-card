import { NextRequest } from "next/server";
import { z } from "zod";
import { formatApiResponse } from "@/shared/lib/security";
import { handleApiError } from "@/shared/lib/apiHandler";
import { requireCompanyAccess } from "@/shared/lib/tenant";
import { SupabaseAgentRepository } from "@/core/infrastructure/database/supabase/SupabaseAgentRepository";
import { KNOWN_TOOL_NAMES } from "@/core/application/tools/ToolRegistry";

const agentRepo = new SupabaseAgentRepository();

const CreateAgentSchema = z.object({
  company_id: z.string().uuid(),
  employee_id: z.string().uuid().optional().nullable(),
  department: z.enum(["SALES", "TECHNICAL_SUPPORT", "RECRUITER", "CUSTOMER_SUCCESS", "SUPERVISOR"]),
  name: z.string().min(2),
  avatar_url: z.string().url().optional().nullable(),
  voice_model_id: z.string().min(1),
  personality_prompt: z.string().min(10),
  capabilities: z.array(z.string()).optional(),
  tools: z.array(z.enum(KNOWN_TOOL_NAMES)).optional(),
  prompt_template_id: z.string().uuid().optional().nullable(),
  escalation_threshold: z.number().min(0).max(1).optional(),
});

export async function GET(req: NextRequest) {
  try {
    const companyId = req.nextUrl.searchParams.get("companyId");
    if (!companyId) return formatApiResponse(null, 400, "companyId query parameter is required");

    await requireCompanyAccess(req, companyId, "read:agents");

    const status = req.nextUrl.searchParams.get("status") as "ACTIVE" | "INACTIVE" | "TESTING" | null;
    const limit = Math.min(Number(req.nextUrl.searchParams.get("limit")) || 20, 100);
    const offset = Number(req.nextUrl.searchParams.get("offset")) || 0;

    const result = await agentRepo.listAgents({ company_id: companyId, status: status ?? undefined, limit, offset });
    return formatApiResponse(result, 200, "Agents retrieved successfully");
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = CreateAgentSchema.parse(body);

    await requireCompanyAccess(req, parsed.company_id, "write:agents");

    const agent = await agentRepo.createAgent(parsed);
    return formatApiResponse(agent, 201, "Agent created successfully");
  } catch (error) {
    return handleApiError(error);
  }
}
