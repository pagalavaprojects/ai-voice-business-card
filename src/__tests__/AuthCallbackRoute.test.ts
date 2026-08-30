import { NextRequest } from "next/server";

/**
 * The emailed-link exchange point. Password recovery is impossible without
 * it: Supabase's PKCE links carry a single-use `code` that authenticates
 * nobody until it is traded for a session, so a missing or broken handler
 * here means every reset link lands on a page that cannot identify the
 * visitor.
 *
 * These tests pin the three properties that make it safe to put in an email:
 * the `next` parameter can never leave the origin, a failed exchange never
 * explains itself, and the code never appears in a redirect or a log.
 */

const exchangeCodeForSession = jest.fn();

jest.mock("@supabase/ssr", () => ({
  createServerClient: () => ({ auth: { exchangeCodeForSession } }),
}));

import { GET } from "@/app/auth/callback/route";

function callbackRequest(query: string): NextRequest {
  return new NextRequest(`https://maylaanai.com/auth/callback${query}`);
}

describe("GET /auth/callback", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    exchangeCodeForSession.mockResolvedValue({ error: null });
  });

  it("exchanges the code and forwards to the requested path", async () => {
    const res = await GET(callbackRequest("?code=one-time-code&next=/reset-password"));

    expect(exchangeCodeForSession).toHaveBeenCalledWith("one-time-code");
    expect(res.status).toBe(307);
    expect(new URL(res.headers.get("location") as string).pathname).toBe("/reset-password");
  });

  it("hands a link with no code to the browser, which can see the fragment", async () => {
    // Supabase issues two link shapes. The dashboard's own "send magic link"
    // and "reset password" buttons put the whole session in the FRAGMENT,
    // which never reaches a server — so a missing `code` is not proof the
    // link is broken, and treating it as such dumped valid links on an
    // error page. Only the browser can tell the two apart.
    const res = await GET(callbackRequest("?next=/reset-password"));
    const html = await res.text();

    expect(exchangeCodeForSession).not.toHaveBeenCalled();
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    // A fragment session is carried to the destination; anything else still
    // ends up on the same error as before.
    expect(html).toContain("access_token=");
    expect(html).toContain('"/reset-password"');
    expect(html).toContain("/login?error=link_invalid");
    // No recovery marker on this path: without a verified session it would
    // let an unrelated ambient session become the account being changed.
    expect(res.cookies.get("maylaan-recovery-flow")).toBeUndefined();
  });

  it("cannot be talked into carrying a fragment off-origin", async () => {
    const res = await GET(callbackRequest("?next=" + encodeURIComponent("https://evil.example.com/steal")));
    const html = await res.text();

    // The hostile destination is replaced by the safe default, and a
    // protected default is delivered through /login (the fragment cannot
    // survive the middleware redirect a protected page would trigger).
    expect(html).toContain("/login?next=%2Fdashboard");
    expect(html).not.toContain("evil.example.com");
  });

  it("treats an expired, reused or forged code as one indistinguishable failure", async () => {
    exchangeCodeForSession.mockResolvedValue({ error: { message: "invalid request: code verifier should be non-empty" } });

    const res = await GET(callbackRequest("?code=spent-code&next=/reset-password"));
    const location = new URL(res.headers.get("location") as string);

    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("error")).toBe("link_expired");
    // The reason Supabase gave must not reach the visitor, and the code must
    // not be echoed back into a URL that ends up in history or referrers.
    expect(location.search).not.toContain("code verifier");
    expect(location.search).not.toContain("spent-code");
  });

  it("refuses to redirect off-origin, however `next` is dressed up", async () => {
    const BS = String.fromCharCode(92); // backslash
    const TAB = String.fromCharCode(9);
    for (const hostile of [
      "https://evil.example.com/steal",
      "//evil.example.com/steal",
      "javascript:alert(1)",
      // The bypasses the old "starts with / but not //" prefix test let
      // through — normalised by the URL parser to a protocol-relative host.
      "/" + BS + "evil.example.com",
      "/" + TAB + "/evil.example.com",
    ]) {
      const res = await GET(callbackRequest(`?code=c&next=${encodeURIComponent(hostile)}`));
      const location = new URL(res.headers.get("location") as string);

      expect(location.origin).toBe("https://maylaanai.com");
      expect(location.pathname).toBe("/dashboard");
    }
  });

  it("marks a recovery arrival so the reset page knows which flow this is", async () => {
    const res = await GET(callbackRequest("?code=one-time-code&next=/reset-password"));
    const marker = res.cookies.get("maylaan-recovery-flow");

    // Without this the reset page can only ask "is anyone signed in?", and an
    // unrelated session already in the browser becomes the account it changes.
    expect(marker?.value).toBe("1");
    expect(marker?.maxAge).toBe(600);
  });

  it("does not mark ordinary sign-in arrivals as recovery", async () => {
    const res = await GET(callbackRequest("?code=one-time-code&next=/dashboard"));
    expect(res.cookies.get("maylaan-recovery-flow")).toBeUndefined();
  });

  it("defaults to the dashboard when no destination is given", async () => {
    const res = await GET(callbackRequest("?code=c"));
    expect(new URL(res.headers.get("location") as string).pathname).toBe("/dashboard");
  });
});
