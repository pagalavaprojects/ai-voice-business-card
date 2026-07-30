import { NextRequest, NextResponse } from "next/server";
import { SupabaseKnowledgeRepository } from "@/core/infrastructure/database/supabase/SupabaseKnowledgeRepository";
import { promptAssemblyService, toolRegistry, agentRepo } from "@/core/infrastructure/bootstrap/assistantRuntime";
import { Logger } from "@/shared/lib/logger";

const knowledgeRepo = new SupabaseKnowledgeRepository();

const DEFAULT_FIRST_MESSAGE = "Hello! Thank you for scanning my business card. How can I help you today?";

/** Intentionally unauthenticated — this is the data behind the public
 * voice business card (whoever scans the card's QR/NFC hits this route
 * with no session), unlike everything under /api/admin/*.
 *
 * This does return the assembled system prompt and tool definitions,
 * which is a real tradeoff: the browser needs them to start a live Vapi
 * call with `@vapi-ai/web`'s client SDK, which sends its assistant
 * config directly to Vapi from the browser — so the prompt is visible
 * in devtools network traffic either way once a call starts. Routing it
 * through our own endpoint first doesn't newly expose anything a call
 * wasn't already going to transmit from the browser; it just makes the
 * previously-unused server-side prompt assembly actually reach the
 * client call instead of every live call running a bare, prompt-less
 * model. serverUrl is also returned so tool-calls and the end-of-call
 * report route back to our webhook during the call. */
export async function GET(req: NextRequest, { params }: { params: { companyId: string; employeeId: string } }) {
  const { companyId, employeeId } = params;

  try {
    const [company, employee] = await Promise.all([
      knowledgeRepo.getCompanyById(companyId),
      knowledgeRepo.getEmployeeById(employeeId),
    ]);

    if (!company || !employee || employee.company_id !== companyId) {
      return NextResponse.json({ message: "Business card not found" }, { status: 404 });
    }

    const agent = await agentRepo.getAgentByEmployee(employeeId).catch(() => null);

    const [systemPrompt] = await Promise.all([
      promptAssemblyService.assembleSystemPrompt(companyId, employeeId).catch((err) => {
        Logger.warn("System prompt assembly failed, live call will run without one", {
          companyId,
          employeeId,
          error: err instanceof Error ? err.message : String(err),
        });
        return null;
      }),
    ]);

    const serverUrl = new URL(
      `/api/vapi/webhook?companyId=${encodeURIComponent(companyId)}&employeeId=${encodeURIComponent(employeeId)}`,
      req.nextUrl.origin
    ).toString();

    return NextResponse.json({
      company: {
        name: company.name,
        website: company.website,
        logoUrl: company.logo_url,
      },
      employee: {
        name: employee.name,
        designation: employee.designation,
        email: employee.email,
        phone: employee.phone,
        officeAddress: employee.office_address,
        workingHours: employee.working_hours,
        avatarUrl: agent?.avatar_url ?? null,
      },
      firstMessage: agent?.first_message?.trim() || DEFAULT_FIRST_MESSAGE,
      systemPrompt,
      tools: toolRegistry.getAllToolDefinitions(),
      serverUrl,
    });
  } catch (err) {
    // Supabase unreachable/unconfigured (e.g. placeholder credentials) is
    // an infrastructure condition, not "this card doesn't exist" — the
    // client falls back to a local demo card either way, but the status
    // code distinguishes the two cases for anyone debugging deployment.
    Logger.warn("Public business card lookup failed", { companyId, employeeId, error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ message: "Business card service unavailable" }, { status: 503 });
  }
}
