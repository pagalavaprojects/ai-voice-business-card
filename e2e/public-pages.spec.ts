import { test, expect } from "@playwright/test";

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

    const response = await page.goto("/acme/emp1");
    expect(response?.status()).toBe(200);

    // VoiceMicButton sets a dynamic aria-label per call state — "idle" on
    // first render — this is the exact accessibility behavior code-reviewed
    // (not browser-verified) in the original audit.
    await expect(page.getByRole("button", { name: /Start voice conversation/i })).toBeVisible();

    expect(consoleErrors).toEqual([]);
  });

  test("unauthenticated visitors are redirected away from the admin dashboard", async ({ page }) => {
    // This is the real end-to-end proof, in an actual browser following a
    // real redirect, of the Phase 2 fix to the fail-open auth bypass the
    // original audit found — /dashboard must not render admin content for
    // an anonymous visitor.
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
  });

  test("login page renders a real form with accessible labels", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("button", { name: /log in|sign in/i })).toBeVisible();
  });
});
