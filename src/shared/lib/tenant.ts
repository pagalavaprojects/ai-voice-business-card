import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextRequest } from "next/server";
import { Permission, UserRole, hasPermission } from "@/shared/lib/rbac";
import { SupabaseMembershipRepository } from "@/core/infrastructure/database/supabase/SupabaseMembershipRepository";

export class AuthError extends Error {
  constructor(public status: 401 | 403, message: string) {
    super(message);
    this.name = "AuthError";
  }
}

export interface AuthenticatedUser {
  id: string;
  email: string;
}

const membershipRepo = new SupabaseMembershipRepository();

/** Reads the Supabase session from request cookies. Read-only: this helper
 * never needs to set cookies back, unlike the sign-in flow in middleware. */
export async function getAuthenticatedUser(req: NextRequest): Promise<AuthenticatedUser | null> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co";
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder-key";

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      get(name: string) {
        return req.cookies.get(name)?.value;
      },
      set(_name: string, _value: string, _options: CookieOptions) {
        // no-op: this helper only reads the session for authorization checks
      },
      remove(_name: string, _options: CookieOptions) {
        // no-op
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !user.email) return null;
  return { id: user.id, email: user.email };
}

export interface CompanyAccess {
  userId: string;
  email: string;
  role: UserRole;
  isPlatformAdmin: boolean;
}

export interface MembershipLookup {
  isPlatformAdmin(userId: string): Promise<boolean>;
  getMembership(companyId: string, userId: string): ReturnType<typeof membershipRepo.getMembership>;
}

/**
 * The pure authorization decision, factored out from request/cookie
 * plumbing so it can be unit-tested directly against fake user/membership
 * data (see tenant.test.ts) without needing a real NextRequest or Supabase
 * session. This is the function the prior audit's missing tenant check
 * ultimately resolves to.
 */
export async function resolveCompanyAccess(
  user: AuthenticatedUser | null,
  companyId: string,
  permission: Permission,
  lookup: MembershipLookup
): Promise<CompanyAccess> {
  if (!user) throw new AuthError(401, "Authentication required");

  const isPlatformAdmin = await lookup.isPlatformAdmin(user.id);
  if (isPlatformAdmin) {
    return { userId: user.id, email: user.email, role: "OWNER", isPlatformAdmin: true };
  }

  const membership = await lookup.getMembership(companyId, user.id);
  if (!membership || membership.status !== "ACTIVE") {
    throw new AuthError(403, "You do not have access to this company");
  }
  if (!hasPermission(membership.role, permission)) {
    throw new AuthError(403, `Role '${membership.role}' does not have permission '${permission}'`);
  }

  return { userId: user.id, email: user.email, role: membership.role, isPlatformAdmin: false };
}

/**
 * The real tenant-isolation check the prior audit found missing: confirms
 * the authenticated user actually belongs to `companyId` (or is a platform
 * admin) and holds at least the given permission, before any repository
 * call runs. This is the primary enforcement point — the app's Supabase
 * repositories use the service-role key, which bypasses RLS entirely, so
 * RLS policies alone cannot be relied on here.
 */
export async function requireCompanyAccess(
  req: NextRequest,
  companyId: string,
  permission: Permission
): Promise<CompanyAccess> {
  const user = await getAuthenticatedUser(req);
  return resolveCompanyAccess(user, companyId, permission, membershipRepo);
}
