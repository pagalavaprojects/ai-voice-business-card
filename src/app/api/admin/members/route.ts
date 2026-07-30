import { NextRequest } from "next/server";
import { z } from "zod";
import { formatApiResponse } from "@/shared/lib/security";
import { handleApiError } from "@/shared/lib/apiHandler";
import { requireCompanyAccess } from "@/shared/lib/tenant";
import { SupabaseMembershipRepository } from "@/core/infrastructure/database/supabase/SupabaseMembershipRepository";

const membershipRepo = new SupabaseMembershipRepository();

const InviteMemberSchema = z.object({
  company_id: z.string().uuid(),
  email: z.string().email(),
  role: z.enum(["OWNER", "ADMIN", "MANAGER", "EMPLOYEE", "VIEWER"]),
});

export async function GET(req: NextRequest) {
  try {
    const companyId = req.nextUrl.searchParams.get("companyId");
    if (!companyId) return formatApiResponse(null, 400, "companyId query parameter is required");

    await requireCompanyAccess(req, companyId, "read:settings");
    const members = await membershipRepo.listMembers(companyId);
    return formatApiResponse(members, 200, "Members retrieved successfully");
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = InviteMemberSchema.parse(body);

    const access = await requireCompanyAccess(req, parsed.company_id, "manage:members");
    const member = await membershipRepo.inviteMember(parsed.company_id, parsed.email, parsed.role, access.userId);
    return formatApiResponse(member, 201, "Member invited successfully");
  } catch (error) {
    return handleApiError(error);
  }
}
