import { defineConfig, devices } from "@playwright/test";

/**
 * Real browser E2E config — the original audit explicitly flagged that no
 * browser-automation tool was available, so pages/responsiveness could
 * only be checked via HTTP status codes and code review, never an actual
 * rendered browser. This is that gap closed: `npx playwright install
 * chromium` genuinely downloads and runs a real Chromium binary in this
 * environment (verified — see PLAYWRIGHT_VERIFICATION notes in the final
 * report).
 *
 * webServer starts a real production server (`next start`) before the suite
 * runs. It does NOT build — run `npm run build` first, or the server exits
 * with "Could not find a production build".
 *
 * Prerequisites: these specs now require a live Supabase project seeded via
 * `npm run seed:pagalava`. That is deliberate — the public card no longer
 * invents a fallback identity when the lookup fails, so asserting against a
 * real seeded card is the only way to test what visitors actually see.
 * Vapi/Cal.com/Resend are still not required: nothing here starts a live
 * voice call or books anything.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:3100",
    trace: "retain-on-failure",
    // Pinned so the pre-conversation language gate's initial (browser-
    // detected) language is deterministic across any host machine — the
    // multilingual suite's selectLanguageViaGate helper locates that gate
    // via its English aria-label regardless of which language a given test
    // then selects, since the gate always shows in the *detected* language
    // first, not the target one. Without a pinned locale, a host whose OS
    // locale isn't English would render that first-paint gate in a
    // different language and the helper's regex would never match.
    locale: "en-US",
  },
  // iPad/Mobile use Chromium with the real iPad/iPhone viewport + touch
  // metrics rather than Playwright's WebKit device presets — only the
  // Chromium binary was downloaded in this environment (a second ~200MB+
  // engine for two more viewport sizes isn't worth it when the goal is
  // responsive-layout verification, not engine-specific rendering bugs).
  projects: [
    { name: "Desktop Chrome", use: { ...devices["Desktop Chrome"] } },
    {
      name: "iPad",
      use: { ...devices["Desktop Chrome"], viewport: devices["iPad Pro 11"].viewport, hasTouch: true },
    },
    {
      name: "Mobile",
      use: { ...devices["Desktop Chrome"], viewport: devices["iPhone 13"].viewport, hasTouch: true, isMobile: true },
    },
  ],
  webServer: {
    command: "npm run start -- -p 3100",
    url: "http://localhost:3100",
    reuseExistingServer: !process.env.CI,
    timeout: 60000,
  },
});
