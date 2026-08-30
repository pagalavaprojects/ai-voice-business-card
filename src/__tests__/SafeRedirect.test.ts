import { sameOriginPath } from "@/shared/lib/safeRedirect";

/**
 * The open-redirect guard for post-auth `next` targets.
 *
 * The bug this replaces: `next.startsWith("/") && !next.startsWith("//")`
 * accepts "/\evil.com" and "/\t/evil.com", which the URL parser and browsers
 * normalise to the protocol-relative "//evil.com" and follow off-site. Every
 * emailed auth link carries an attacker-chosen `next`, so this is the one
 * thing standing between a login link and an open redirect.
 */

const ORIGIN = "https://maylaanai.com";

describe("sameOriginPath", () => {
  it("keeps genuine same-origin relative paths", () => {
    expect(sameOriginPath("/dashboard", ORIGIN)).toBe("/dashboard");
    expect(sameOriginPath("/reset-password?type=recovery", ORIGIN)).toBe("/reset-password?type=recovery");
    expect(sameOriginPath("/leads#top", ORIGIN)).toBe("/leads#top");
  });

  it("rejects the classic protocol-relative bypass", () => {
    expect(sameOriginPath("//evil.com", ORIGIN)).toBe("/dashboard");
    expect(sameOriginPath("//evil.com/steal", ORIGIN)).toBe("/dashboard");
  });

  it("rejects the backslash bypass that the prefix test let through", () => {
    // "/\evil.com" — a real browser + the WHATWG URL parser normalise the
    // backslash to a slash, yielding "//evil.com".
    expect(sameOriginPath("/" + String.fromCharCode(92) + "evil.com", ORIGIN)).toBe("/dashboard");
  });

  it("rejects the tab/control-character bypass", () => {
    expect(sameOriginPath("/" + String.fromCharCode(9) + "/evil.com", ORIGIN)).toBe("/dashboard");
  });

  it("rejects absolute off-origin URLs", () => {
    expect(sameOriginPath("https://evil.com/steal", ORIGIN)).toBe("/dashboard");
    expect(sameOriginPath("http://maylaanai.com.evil.com", ORIGIN)).toBe("/dashboard");
  });

  it("falls back for empty / null / malformed input", () => {
    expect(sameOriginPath(null, ORIGIN)).toBe("/dashboard");
    expect(sameOriginPath("", ORIGIN)).toBe("/dashboard");
    expect(sameOriginPath(undefined, ORIGIN)).toBe("/dashboard");
  });

  it("honours a caller-provided fallback", () => {
    expect(sameOriginPath("//evil.com", ORIGIN, "/login")).toBe("/login");
  });

  it("never returns an off-origin absolute URL for any of the bypasses", () => {
    const BS = String.fromCharCode(92);
    for (const hostile of ["//evil.com", "/" + BS + "evil.com", "https://evil.com", "/" + BS + BS + "evil.com"]) {
      const out = sameOriginPath(hostile, ORIGIN);
      expect(out.startsWith("/")).toBe(true);
      expect(out.startsWith("//")).toBe(false);
      expect(out.includes("evil.com")).toBe(false);
    }
  });
});
