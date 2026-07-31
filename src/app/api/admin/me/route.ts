import { NextRequest } from "next/server";
import { formatApiResponse } from "@/shared/lib/security";
import { handleApiError } from "@/shared/lib/apiHandler";
import { getAuthenticatedUser, AuthError } from "@/shared/lib/tenant";
import { SupabaseMembershipRepository } from "@/core/infrastructure/database/supabase/SupabaseMembershipRepository";
import { supabaseAdmin } from "@/shared/lib/supabase";

const membershipRepo = new SupabaseMembershipRepository();

// This route reads the session cookie, so it can never be statically
// rendered. Declaring that explicitly stops the build from attempting a
// static pass and logging a "Dynamic server usage" error for behaviour that
// is entirely intended.
export const dynamic = "force-dynamic";

/** Returns the signed-in user plus every company they belong to, with role.
 * This is what lets the dashboard resolve "which company am I looking at"
 * instead of hardcoding one — every other admin page depends on it. */
export async function GET(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) throw new AuthError(401, "Authentication required");

    const isPlatformAdmin = await membershipRepo.isPlatformAdmin(user.id);

    const { data: memberships, error } = await supabaseAdmin
      .from("company_members")
      .select("*, company:companies(*)")
      .eq("user_id", user.id)
      .eq("status", "ACTIVE");

    if (error) throw new Error(`Failed to load memberships: ${error.message}`);

    return formatApiResponse(
      { user, isPlatformAdmin, memberships: memberships || [] },
      200,
      "Session retrieved successfully"
    );
  } catch (error) {
    return handleApiError(error);
  }
}
