import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
// Imported from rateLimitMemory (not rateLimit) on purpose: this file runs on
// the Edge runtime, and rateLimit.ts pulls in ioredis, which fails the
// production build here with UnhandledSchemeError on node:diagnostics_channel.
import { checkRateLimit } from "@/shared/lib/rateLimitMemory";

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  // Layer 1 of 2: a cheap per-instance IP filter that rejects floods before
  // they reach the database or Supabase auth. It is intentionally NOT the
  // authoritative limit — middleware runs on the Edge runtime, where ioredis
  // cannot open a TCP socket, so a distributed limit is not expressible here.
  // The authoritative, Redis-backed, per-user limit lives in
  // requireCompanyAccess (Node runtime), which all 28 admin routes await.
  // The ceiling here is deliberately looser so it catches abuse without
  // pre-empting the accurate limit downstream.
  if (request.nextUrl.pathname.startsWith("/api/admin")) {
    const identifier = request.headers.get("x-forwarded-for") || "unknown";
    const { allowed } = checkRateLimit(`admin:${identifier}`, 300, 60_000);
    if (!allowed) {
      return NextResponse.json(
        { status: 429, success: false, message: "Too Many Requests", data: null, errors: ["Rate limit exceeded"] },
        { status: 429 }
      );
    }
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co";
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder-key";

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      get(name: string) {
        return request.cookies.get(name)?.value;
      },
      set(name: string, value: string, options: CookieOptions) {
        request.cookies.set({ name, value, ...options });
        response = NextResponse.next({
          request: {
            headers: request.headers,
          },
        });
        response.cookies.set({ name, value, ...options });
      },
      remove(name: string, options: CookieOptions) {
        request.cookies.set({ name, value: "", ...options });
        response = NextResponse.next({
          request: {
            headers: request.headers,
          },
        });
        response.cookies.set({ name, value: "", ...options });
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Protect Admin Dashboard and Admin API Routes
  const isProtectedPath =
    request.nextUrl.pathname.startsWith("/dashboard") ||
    request.nextUrl.pathname.startsWith("/api/admin");

  if (isProtectedPath && !user) {
    // Demo-mode bypass is only permitted outside production. Production must
    // always fail closed, even if Supabase env vars are missing/placeholder,
    // otherwise the admin dashboard and admin API become fully unauthenticated.
    if (process.env.NODE_ENV !== "production" && supabaseUrl.includes("placeholder")) {
      return response;
    }

    if (request.nextUrl.pathname.startsWith("/api/admin")) {
      return NextResponse.json(
        { status: 401, success: false, message: "Unauthorized", data: null, errors: ["Authentication required"] },
        { status: 401 }
      );
    }

    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

export const config = {
  matcher: ["/dashboard/:path*", "/api/admin/:path*"],
};
