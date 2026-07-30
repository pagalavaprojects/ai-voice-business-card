import { NextRequest, NextResponse } from "next/server";
import { SupabaseKnowledgeRepository } from "@/core/infrastructure/database/supabase/SupabaseKnowledgeRepository";
import { SupabaseAgentRepository } from "@/core/infrastructure/database/supabase/SupabaseAgentRepository";
import { Logger } from "@/shared/lib/logger";

const knowledgeRepo = new SupabaseKnowledgeRepository();
const agentRepo = new SupabaseAgentRepository();

const DEFAULT_FIRST_MESSAGE = "Hello! Thank you for scanning my business card. How can I help you today?";

/** Intentionally unauthenticated — this is the data behind the public
 * voice business card (whoever scans the card's QR/NFC hits this route
 * with no session), unlike everything under /api/admin/*. Only
 * visitor-safe fields are returned: no internal IDs beyond what's
 * already in the URL, no personality_prompt, no tool config. */
export async function GET(_req: NextRequest, { params }: { params: { companyId: string; employeeId: string } }) {
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
