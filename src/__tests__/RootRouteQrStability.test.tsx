/**
 * @jest-environment jsdom
 *
 * The printed MaylaanAI business-card QR encodes https://maylaanai.com/ — a
 * static, non-expiring code intended to stay usable for 3+ years. That makes
 * the ROOT ROUTE a long-lived public entry point. These tests pin the
 * assumptions the QR depends on, so a future redesign fails here BEFORE it
 * silently breaks a printed card:
 *
 *  - GET / renders publicly: no login form, no session/cookie/header
 *    dependency, no redirect gate, no language-query dependency.
 *  - It is a MaylaanAI entry experience that reaches the business card.
 *  - Nothing plays or starts on load (no audio, no Vapi).
 *
 * The QR image itself is never touched by the application; only the
 * destination's stability is the app's responsibility.
 */
import "@testing-library/jest-dom";
import fs from "fs";
import path from "path";
import { render, screen } from "@testing-library/react";
import HomePage, { metadata } from "@/app/page";
import { DEMO_COMPANY_ID, DEMO_EMPLOYEE_ID } from "@/shared/lib/demoCard";

describe("root route (/) — printed-QR destination stability", () => {
  it("renders publicly with no login form and no audio/voice started on load", () => {
    const { container } = render(<HomePage />);
    expect(container.querySelector("input[type=password]")).toBeNull();
    expect(container.querySelector("form")).toBeNull(); // no auth gate on the entry page
    expect(container.querySelectorAll("audio")).toHaveLength(0); // no autoplay
    expect(screen.getAllByText(/Maylaan AI/i).length).toBeGreaterThan(0);
  });

  it("carries the MaylaanAI page title (what a QR scanner's browser shows)", () => {
    expect(String(metadata.title)).toMatch(/Maylaan AI/);
  });

  it("offers a same-origin path from the root to the business-card experience", () => {
    const { container } = render(<HomePage />);
    const hrefs = [...container.querySelectorAll("a[href]")].map((a) => a.getAttribute("href") || "");
    const cardHref = `/${DEMO_COMPANY_ID}/${DEMO_EMPLOYEE_ID}`;
    expect(hrefs.some((h) => h.startsWith(cardHref))).toBe(true);
    // Every link on the entry page is same-origin (no off-domain redirect hop).
    for (const h of hrefs) expect(h).toMatch(/^(\/|#)/);
  });

  it("has NO server-side session/cookie/header or redirect dependency (source guard)", () => {
    // If someone later gates the root behind auth or cookies, the printed QR
    // would land visitors on a login/redirect — this fails first.
    const src = fs.readFileSync(path.join(process.cwd(), "src/app/page.tsx"), "utf8");
    expect(src).not.toMatch(/from ["']next\/headers["']/);
    expect(src).not.toMatch(/\bcookies\(\)/);
    expect(src).not.toMatch(/\bheaders\(\)/);
    expect(src).not.toMatch(/\bredirect\(/);
    expect(src).not.toMatch(/requireAuth|getSession|requireCompanyAccess|requireOwnCompanyScope/);
    expect(src).not.toMatch(/searchParams/); // no query-parameter dependency
  });
});
