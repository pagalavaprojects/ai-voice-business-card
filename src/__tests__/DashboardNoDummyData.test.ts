/**
 * Guards the live dashboard against the demo numbers from the design
 * reference screenshot ever entering the source as data. These exact values
 * were once hardcoded on this page (1,284 conversations, 412 leads,
 * "+18.4%") and appear in the reference image (128, 256, 48%, 99.9%,
 * "40 New" …). A dashboard number must come from the API or not exist.
 */
import fs from "fs";
import path from "path";

const DASHBOARD_SOURCES = [
  "src/app/(admin)/dashboard/page.tsx",
  "src/app/(admin)/dashboard/analytics/page.tsx",
  "src/app/api/admin/stats/route.ts",
  "src/app/api/admin/analytics/route.ts",
  "src/shared/lib/dashboardLive.ts",
  "src/shared/lib/providerHealth.ts",
];

const FORBIDDEN = [
  /1,?284/,
  /\b412 leads\b/,
  /\+\s?18\.4\s?%/,
  /\b48\s?%/,
  /\b99\.9\s?%/,
  /\b40 New\b/i,
  /\b35 Interested\b/i,
  /\b25 Follow ?Up\b/i,
  /\b18 Converted\b/i,
  /\b10 Closed\b/i,
  /06:45:32/,
];

/** Comments may legitimately DESCRIBE the old hardcoded values (that history
 * is worth keeping in the source); only executable code and JSX must be
 * clean. Strip comments before scanning. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
}

describe("dashboard sources contain no screenshot/demo metric values", () => {
  for (const rel of DASHBOARD_SOURCES) {
    it(`${rel} is free of forbidden demo values`, () => {
      const source = stripComments(fs.readFileSync(path.join(process.cwd(), rel), "utf8"));
      for (const pattern of FORBIDDEN) {
        expect(source).not.toMatch(pattern);
      }
    });
  }
});
