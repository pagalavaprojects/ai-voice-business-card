import { NextRequest } from "next/server";
import { UserRole, roleAtLeast } from "@/shared/lib/rbac";
import { SupabaseMembershipRepository } from "@/core/infrastructure/database/supabase/SupabaseMembershipRepository";
import { AuthError, AuthenticatedUser, getAuthenticatedUser } from "@/shared/lib/tenant";

/**
 * Which dashboard an authenticated identity is entitled to, and — for a
 * non-admin — WHICH company's rows they may see.
 *
 * Why this exists alongside requireCompanyAccess: that helper answers "may
 * this user touch the companyId they just asked for?", which is the right
 * question for an admin surface where the caller legitimately names a
 * tenant. The user dashboard must never be told which tenant to render;
 * being told is exactly the IDOR the separation is meant to remove. This
 * resolver therefore derives the tenant from the SESSION alone and offers
 * no parameter through which a client could influence it.
 *
 * Platform admin (`users.is_platform_admin`) is deliberately cross-tenant —
 * it is not a company role, so it is resolved independently of membership.
 */

export type DashboardAudience = "admin" | "user";

export interface DashboardScope {
  user: AuthenticatedUser;
  audience: DashboardAudience;
  isPlatformAdmin: boolean;
  /** The company whose rows this identity may read on the USER surface.
   * Null only when the identity holds no active membership at all (a
   * platform admin with no company of their own is the realistic case). */
  companyId: string | null;
  /** Their role in that company; null alongside a null companyId. */
  role: UserRole | null;
}

export interface ScopeLookup {
  isPlatformAdmin(userId: string): Promise<boolean>;
  listActiveMembershipsForUser(userId: string): Promise<Array<{ company_id: string; role: UserRole }>>;
}

const membershipRepo = new SupabaseMembershipRepository();

/**
 * The pure decision, split from cookie plumbing so the isolation rules can be
 * unit-tested directly against fake identities rather than only through HTTP.
 */
export async function resolveDashboardScope(
  user: AuthenticatedUser | null,
  lookup: ScopeLookup
): Promise<DashboardScope> {
  if (!user) throw new AuthError(401, "Authentication required");

  const [isPlatformAdmin, memberships] = await Promise.all([
    lookup.isPlatformAdmin(user.id),
    lookup.listActiveMembershipsForUser(user.id),
  ]);

  // Oldest active membership is the user's home tenant. Multi-tenant members
  // are not silently merged: the user surface renders ONE company, because
  // aggregating several would make "my numbers" ambiguous and would leak one
  // tenant's totals into another's view.
  const primary = memberships[0] ?? null;

  return {
    user,
    audience: isPlatformAdmin ? "admin" : "user",
    isPlatformAdmin,
    companyId: primary?.company_id ?? null,
    role: primary?.role ?? null,
  };
}

/** Session-derived scope for the current request. */
export async function getDashboardScope(req: NextRequest): Promise<DashboardScope> {
  return resolveDashboardScope(await getAuthenticatedUser(req), membershipRepo);
}

/**
 * Gate for genuinely platform-wide data (every company's rows). Only
 * `users.is_platform_admin` passes — a company OWNER is the top of THEIR
 * tenant, not of the platform, so owning a company must never grant sight of
 * another company's numbers.
 */
export async function requirePlatformAdmin(req: NextRequest): Promise<DashboardScope> {
  const scope = await getDashboardScope(req);
  if (!scope.isPlatformAdmin) {
    // Deliberately identical whether or not platform data exists — the
    // refusal must not confirm anything about other tenants.
    throw new AuthError(403, "This resource is restricted to platform administrators");
  }
  return scope;
}

/**
 * Gate for the user surface. Returns the company the SESSION resolves to;
 * accepts no companyId argument by design, so there is no parameter for a
 * crafted id to travel through.
 */
export async function requireOwnCompanyScope(req: NextRequest, minRole: UserRole = "VIEWER"): Promise<DashboardScope & { companyId: string }> {
  const scope = await getDashboardScope(req);

  if (!scope.companyId) {
    throw new AuthError(403, "Your account is not linked to a company yet");
  }
  // A platform admin bypasses the role floor (they outrank every company
  // role by construction); everyone else must clear it inside their own
  // tenant.
  if (!scope.isPlatformAdmin && (!scope.role || !roleAtLeast(scope.role, minRole))) {
    throw new AuthError(403, "Your role does not have access to this dashboard");
  }

  return { ...scope, companyId: scope.companyId };
}
