import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/**
 * Real automated WCAG scanning via axe-core running inside an actual
 * browser — substantially stronger evidence than the original audit's
 * Lighthouse-only accessibility pass (which only ran the accessibility
 * category's rule subset). This is the same engine used by axe DevTools
 * and many enterprise a11y pipelines.
 */
test.describe("Accessibility (real axe-core scan, WCAG 2.1 AA)", () => {
  test("landing page has no WCAG 2.1 AA violations", async ({ page }) => {
    await page.goto("/");
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
  });

  test("voice widget page has no WCAG 2.1 AA violations", async ({ page }) => {
    await page.goto("/acme/emp1");
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
  });

  test("login page has no WCAG 2.1 AA violations", async ({ page }) => {
    await page.goto("/login");
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
  });
});
