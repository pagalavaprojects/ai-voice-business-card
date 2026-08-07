import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { SEEDED_CARD_PATH } from "./seeded-card";

/**
 * The axe scans in accessibility.spec.ts only cover PUBLIC pages, because the
 * dashboard is auth-gated and these specs have no session. That left the admin
 * forms unscanned — and a scan of the catalog form found a real WCAG 4.1.2
 * failure: the visually-hidden file input inside the image drop zone was in
 * the accessibility tree with no label, so a screen reader announced an
 * unlabelled file control. It is fixed in CatalogFormPrimitives.
 *
 * This spec keeps the public surface honest about the same class of problem:
 * every control the card renders must carry an accessible name.
 */
test.describe("Catalog surfaces expose accessible names", () => {
  test("every interactive control on the public card has an accessible name", async ({ page }) => {
    await page.goto(SEEDED_CARD_PATH);
    await expect(page.getByRole("radiogroup", { name: /conversation language/i })).toBeVisible({ timeout: 20_000 });
    await page.getByRole("button", { name: /continue/i }).click();
    await expect(page.getByRole("button", { name: /Start voice conversation/i })).toBeVisible({ timeout: 20_000 });

    const unnamed = await page.evaluate(() => {
      const problems: string[] = [];
      for (const el of Array.from(document.querySelectorAll("button, a[href], input, select, textarea"))) {
        const name =
          el.getAttribute("aria-label")?.trim() ||
          el.getAttribute("title")?.trim() ||
          (el as HTMLElement).innerText?.trim() ||
          (el.id ? document.querySelector(`label[for="${el.id}"]`)?.textContent?.trim() : "") ||
          el.closest("label")?.textContent?.trim() ||
          "";
        if (!name) problems.push(el.outerHTML.slice(0, 120));
      }
      return problems;
    });

    expect(unnamed, `Controls without an accessible name:\n${unnamed.join("\n")}`).toEqual([]);
  });

  test("the public card passes a WCAG 2.1 AA scan with product and service sections rendered", async ({ page }) => {
    await page.goto(SEEDED_CARD_PATH);
    await expect(page.getByRole("radiogroup", { name: /conversation language/i })).toBeVisible({ timeout: 20_000 });
    await page.getByRole("button", { name: /continue/i }).click();
    await expect(page.getByRole("button", { name: /Start voice conversation/i })).toBeVisible({ timeout: 20_000 });

    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
  });
});
