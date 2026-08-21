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

/** Returns the signed-in user plus every company they can act on, with role.
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

    let resolved = memberships ?? [];

    // A platform admin administers the PLATFORM, not a company they happen
    // to belong to — the authorization layer already reflects that
    // (resolveCompanyAccess grants them access to any company without a
    // membership row). This endpoint was the one place that still resolved
    // scope purely from company_members, so an admin with no membership got
    // an empty list and the dashboard rendered "No company selected",
    // making platform administration depend on company ownership exactly
    // as it must not. Every company is therefore surfaced to an admin, with
    // any genuine membership row winning so their own role is never
    // relabelled.
    if (isPlatformAdmin) {
      const { data: companies, error: companiesError } = await supabaseAdmin.from("companies").select("*").order("name");
      if (companiesError) throw new Error(`Failed to load companies: ${companiesError.message}`);

      const own = new Map((memberships ?? []).map((m) => [m.company_id, m]));
      resolved = (companies ?? []).map(
        (company) =>
          own.get(company.id) ?? {
            // Shaped like a membership so the client needs no special case,
            // but marked PLATFORM_ADMIN so the UI can tell "I administer
            // this" apart from "I am a member of this".
            id: `platform-admin:${company.id}`,
            company_id: company.id,
            user_id: user.id,
            role: "PLATFORM_ADMIN",
            status: "ACTIVE",
            created_at: company.created_at ?? null,
            company,
          }
      );
    }

    return formatApiResponse({ user, isPlatformAdmin, memberships: resolved }, 200, "Session retrieved successfully");
  } catch (error) {
    return handleApiError(error);
  }
}
