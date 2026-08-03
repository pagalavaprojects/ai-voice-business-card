import { test, expect } from "@playwright/test";

import { SEEDED_CARD_PATH } from "./seeded-card";

test.describe("Public pages (real browser, no live infrastructure required)", () => {
  test("landing page loads with no console errors and the CTA is visible and reachable", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });
    page.on("pageerror", (err) => consoleErrors.push(err.message));

    const response = await page.goto("/");
    expect(response?.status()).toBe(200);

    await expect(page.getByRole("link", { name: /Talk to Demo AI Twin/i })).toBeVisible();
    await expect(page).toHaveTitle(/AI Voice Business Card/i);

    expect(consoleErrors).toEqual([]);
  });

  test("landing page has no automatic horizontal overflow at mobile width", async ({ page }) => {
    await page.goto("/");
    const hasHorizontalScroll = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(hasHorizontalScroll).toBe(false);
  });

  test("voice widget page renders the mic button with its dynamic aria-label", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("pageerror", (err) => consoleErrors.push(err.message));

    const response = await page.goto(SEEDED_CARD_PATH);
    expect(response?.status()).toBe(200);

    // VoiceMicButton sets a dynamic aria-label per call state — "idle" on
    // first render — this is the exact accessibility behavior code-reviewed
    // (not browser-verified) in the original audit.
    //
    // Explicit timeout: the card renders a loading state until
    // /api/public/... resolves, and that route now fans out to six Supabase
    // queries plus QR generation. Under the suite's eight parallel workers
    // that can exceed Playwright's 5s default and fail intermittently — which
    // is a slow round trip, not a broken button.
    await expect(page.getByRole("button", { name: /Start voice conversation/i })).toBeVisible({ timeout: 20_000 });

    expect(consoleErrors).toEqual([]);
  });

  test("an unknown card shows a not-found state instead of a fallback identity", async ({ page }) => {
    // Regression guard: the page used to render a hard-coded Acme / Sarah
    // Connor identity whenever the real card failed to load, so a bad link
    // silently showed a stranger's name and spoke their pitch.
    await page.goto("/00000000-0000-0000-0000-000000000000/00000000-0000-0000-0000-000000000000");

    await expect(page.getByText(/not found|unavailable/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /Start voice conversation/i })).toHaveCount(0);
    expect(await page.locator("body").innerText()).not.toMatch(/Sarah Connor|Acme Autonomous/i);
  });

  test("unauthenticated visitors are redirected away from the admin dashboard", async ({ page }) => {
    // This is the real end-to-end proof, in an actual browser following a
    // real redirect, of the Phase 2 fix to the fail-open auth bypass the
    // original audit found — /dashboard must not render admin content for
    // an anonymous visitor.
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
  });

  test("the products admin surface is closed to anonymous visitors", async ({ page, request }) => {
    // Products drive what the public card shows and what the AI can pitch, so
    // an unauthenticated caller must be able to neither read nor mutate them.
    await page.goto("/dashboard/products");
    await expect(page).toHaveURL(/\/login/);

    const companyId = "33333333-3333-3333-3333-333333333333";
    expect((await request.get(`/api/admin/products?companyId=${companyId}`)).status()).toBe(401);
    expect(
      (await request.post("/api/admin/products/bulk", {
        data: { company_id: companyId, action: "delete", ids: ["11111111-1111-1111-1111-111111111111"] },
      })).status()
    ).toBe(401);
  });

  test("the services admin surface is closed to anonymous visitors", async ({ page, request }) => {
    // Services drive what the public card shows and what the AI pitches, so an
    // unauthenticated caller must be able to neither read nor mutate them.
    await page.goto("/dashboard/services");
    await expect(page).toHaveURL(/\/login/);

    const companyId = "33333333-3333-3333-3333-333333333333";
    expect((await request.get(`/api/admin/services?companyId=${companyId}`)).status()).toBe(401);
    expect(
      (await request.post("/api/admin/services/bulk", {
        data: { company_id: companyId, action: "delete", ids: ["11111111-1111-1111-1111-111111111111"] },
      })).status()
    ).toBe(401);
  });

  test("login page renders a real form with accessible labels", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("button", { name: /log in|sign in/i })).toBeVisible();
  });
});
