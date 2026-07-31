import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextRequest } from "next/server";
import { Permission, UserRole, hasPermission } from "@/shared/lib/rbac";
import { SupabaseMembershipRepository } from "@/core/infrastructure/database/supabase/SupabaseMembershipRepository";
import { checkRateLimitDistributed } from "@/shared/lib/rateLimit";

export class AuthError extends Error {
  constructor(public status: 401 | 403, message: string) {
    super(message);
    this.name = "AuthError";
  }
}

/** Distinct from AuthError so handleApiError can return 429 rather than
 * conflating "too many requests" with "not allowed" — a client that retries
 * on 403 will hammer the endpoint, whereas 429 is the documented back-off
 * signal and carries Retry-After. */
export class RateLimitError extends Error {
  readonly status = 429 as const;
  constructor(public retryAfterSeconds: number) {
    super("Too Many Requests");
    this.name = "RateLimitError";
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
/** Requests/minute per authenticated user against the admin API. */
const ADMIN_RATE_LIMIT = 120;
const ADMIN_RATE_WINDOW_MS = 60_000;

export async function requireCompanyAccess(
  req: NextRequest,
  companyId: string,
  permission: Permission
): Promise<CompanyAccess> {
  const user = await getAuthenticatedUser(req);

  // Enforced here rather than in middleware because Next 14 middleware runs on
  // the Edge runtime, where ioredis cannot open a TCP socket — a Redis-backed
  // limit is simply not expressible there. This function is the one chokepoint
  // every admin route already awaits (verified across all 28), and it runs in
  // the Node runtime, so it is where a genuinely distributed limit can live.
  //
  // Keyed by user id, not IP: IP buckets punish everyone behind one corporate
  // NAT together and are trivially evaded via proxy rotation.
  //
  // Unauthenticated requests are skipped deliberately — there is no stable
  // identity to key on, and resolveCompanyAccess rejects them with 401 on the
  // next line regardless. The edge middleware's IP-based check still fronts
  // them, so they are not unprotected.
  if (user) {
    const { allowed } = await checkRateLimitDistributed(`admin:${user.id}`, ADMIN_RATE_LIMIT, ADMIN_RATE_WINDOW_MS);
    if (!allowed) {
      throw new RateLimitError(Math.ceil(ADMIN_RATE_WINDOW_MS / 1000));
    }
  }

  return resolveCompanyAccess(user, companyId, permission, membershipRepo);
}
