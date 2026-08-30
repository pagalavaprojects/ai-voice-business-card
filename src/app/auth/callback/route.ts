import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { RECOVERY_FLOW_COOKIE } from "@/features/auth/lib/recoveryFlow";
import { sameOriginPath } from "@/shared/lib/safeRedirect";

export const dynamic = "force-dynamic";

/**
 * Where a fragment session may safely be delivered.
 *
 * The fragment only becomes a session once client-side JavaScript on the
 * destination reads it — so the destination must actually render. Sending it
 * to a protected page does not work: the middleware sees a request with no
 * cookie yet and redirects to /login first, and the tokens are gone by the
 * time anything can read them (observed against production). Public pages
 * receive the fragment directly; everything else goes through /login, which
 * renders for anyone, adopts the session and then continues to `next`.
 */
function fragmentLandingFor(next: string): string {
  const isPublic = next.startsWith("/reset-password") || next.startsWith("/login");
  return isPublic ? next : `/login?next=${encodeURIComponent(next)}`;
}

/**
 * The page served when no `code` is present, whose only job is to look at
 * the fragment the server cannot see and route accordingly.
 *
 * `next` is already restricted to a same-origin path by the caller, and it
 * is embedded through JSON.stringify so it cannot break out of the string
 * literal. Nothing else on this page comes from the request.
 */
function fragmentHandoffPage(next: string): string {
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>Signing you in…</title><meta name="robots" content="noindex"></head>
<body style="margin:0;background:#0c111d;color:#94a3b8;font:14px system-ui,sans-serif;display:grid;place-items:center;height:100vh">
<p>Signing you in…</p>
<noscript><p>This link needs JavaScript. <a href="/login" style="color:#38bdf8">Go to sign in</a>.</p></noscript>
<script>
(function () {
  var hash = window.location.hash || "";
  var landing = ${JSON.stringify(fragmentLandingFor(next))};
  if (hash.indexOf("access_token=") !== -1 || hash.indexOf("error=") !== -1) {
    window.location.replace(landing + hash);
  } else {
    window.location.replace("/login?error=link_invalid");
  }
})();
</script>
</body>
</html>`;
}

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
  // Only a same-origin destination may be followed — otherwise every emailed
  // link is an open redirect. See sameOriginPath: a "starts with / but not //"
  // prefix test is bypassable with a backslash or tab.
  const next = sameOriginPath(requestedNext, req.nextUrl.origin);

  if (!code) {
    // No code in the query does NOT mean the link is broken. Supabase issues
    // two shapes of auth link: the PKCE one this route exchanges, and an
    // older one that carries the whole session in the URL FRAGMENT — which
    // the browser never sends to a server, so from here the two are
    // indistinguishable. The Supabase dashboard's own "send magic link" and
    // "reset password" buttons produce the second shape, and treating it as
    // invalid meant a perfectly good link dumped the operator on an error.
    //
    // Only the browser can tell them apart, so hand the decision to it: if a
    // fragment session is present, carry it to the destination (whose client
    // consumes it), otherwise fall through to the same error as before.
    // Deliberately NO recovery marker is set here — the reset page learns
    // about a fragment recovery from Supabase's PASSWORD_RECOVERY event, and
    // setting the marker without a verified session would let an unrelated
    // ambient session become the account whose password gets changed.
    return new NextResponse(fragmentHandoffPage(next), {
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
    });
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

  if (next.startsWith("/reset-password")) {
    // Tell the reset page that THIS session came from a recovery link.
    // Without a marker that page can only ask "is anyone signed in?", and an
    // unrelated session that happens to exist in the browser would silently
    // become the account whose password gets changed.
    response.cookies.set({
      name: RECOVERY_FLOW_COOKIE,
      value: "1",
      path: "/",
      maxAge: 600,
      sameSite: "lax",
      secure: true,
    });
  }

  return response;
}
