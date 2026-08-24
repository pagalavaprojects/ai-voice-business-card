import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export const dynamic = "force-dynamic";

/**
 * The landing point for every emailed auth link — password recovery and
 * address confirmation both arrive here.
 *
 * Supabase's PKCE links carry a one-time `code`, which is worthless until it
 * is exchanged for a session; without this handler those links land on a
 * page that cannot authenticate anyone, which is exactly why password reset
 * could not work before it existed. The exchange happens server-side so the
 * resulting session is written as the same cookie the middleware and every
 * server route already read.
 *
 * The code is never logged: it is a single-use credential, and an error path
 * that echoed it would put it in server logs. Failures redirect to a page
 * that says the link is no longer usable rather than reporting why, which
 * would tell an attacker whether a given code was real.
 */
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const requestedNext = req.nextUrl.searchParams.get("next") ?? "/dashboard";
  // Only same-origin relative paths may be followed — an absolute URL here
  // would turn every emailed link into an open redirect.
  const next = requestedNext.startsWith("/") && !requestedNext.startsWith("//") ? requestedNext : "/dashboard";

  if (!code) {
    return NextResponse.redirect(new URL("/login?error=link_invalid", req.url));
  }

  const response = NextResponse.redirect(new URL(next, req.url));

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder-key",
    {
      cookies: {
        get: (name: string) => req.cookies.get(name)?.value,
        set: (name: string, value: string, options: CookieOptions) => {
          response.cookies.set({ name, value, ...options });
        },
        remove: (name: string, options: CookieOptions) => {
          response.cookies.set({ name, value: "", ...options });
        },
      },
    }
  );

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    // Expired, already used, or forged — all the same to the visitor.
    return NextResponse.redirect(new URL("/login?error=link_expired", req.url));
  }

  return response;
}
