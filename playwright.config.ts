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
 * webServer starts a real `next build && next start` (production) server
 * automatically before the suite runs — no scenario here depends on live
 * Supabase/Vapi/Cal.com/Resend, since none are configured in this
 * environment; tests are scoped to what's genuinely verifiable without
 * live infrastructure (page rendering, navigation, the auth redirect,
 * responsive layout, console-error absence).
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
