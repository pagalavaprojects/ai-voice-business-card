import { NextRequest } from "next/server";
import { z } from "zod";
import { formatApiResponse } from "@/shared/lib/security";
import { handleApiError } from "@/shared/lib/apiHandler";
import { requireCompanyAccess } from "@/shared/lib/tenant";
import { SupabaseMembershipRepository } from "@/core/infrastructure/database/supabase/SupabaseMembershipRepository";

const membershipRepo = new SupabaseMembershipRepository();

const UpdateRoleSchema = z.object({
  company_id: z.string().uuid(),
  role: z.enum(["OWNER", "ADMIN", "MANAGER", "EMPLOYEE", "VIEWER"]),
});

export async function PUT(req: NextRequest, { params }: { params: { memberId: string } }) {
  try {
    const body = await req.json();
    const parsed = UpdateRoleSchema.parse(body);

    await requireCompanyAccess(req, parsed.company_id, "manage:members");
    const member = await membershipRepo.updateMemberRole(parsed.company_id, params.memberId, parsed.role);
    return formatApiResponse(member, 200, "Member role updated successfully");
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { memberId: string } }) {
  try {
    const companyId = req.nextUrl.searchParams.get("companyId");
    if (!companyId) return formatApiResponse(null, 400, "companyId query parameter is required");

    await requireCompanyAccess(req, companyId, "manage:members");
    await membershipRepo.removeMember(companyId, params.memberId);
    return formatApiResponse(null, 200, "Member removed successfully");
  } catch (error) {
    return handleApiError(error);
  }
}
