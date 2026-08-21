import { cookies, headers } from "next/headers";
import { NextRequest } from "next/server";
import { getDashboardScope, DashboardScope } from "@/shared/lib/dashboardScope";
import { AuthError } from "@/shared/lib/tenant";

/**
 * Session scope for a SERVER COMPONENT.
 *
 * Lives outside the page files because a Next.js route/page module may only
 * export the framework's own entry points — exporting a helper from a page
 * fails the build's generated type check.
 *
 * Returns null for an unauthenticated visitor so the caller can redirect;
 * any other failure propagates, because silently rendering a dashboard after
 * an unexplained authorization error is exactly the wrong default.
 */
export async function resolveScopeForPage(): Promise<DashboardScope | null> {
  const cookieHeader = cookies()
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");
  const host = headers().get("host") ?? "localhost";
  const req = new NextRequest(`https://${host}/dashboard`, { headers: { cookie: cookieHeader } });
  try {
    return await getDashboardScope(req);
  } catch (err) {
    if (err instanceof AuthError) return null;
    throw err;
  }
}
