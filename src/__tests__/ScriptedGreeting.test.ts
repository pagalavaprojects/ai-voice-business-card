import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Locks the exact scripted opening.
 *
 * Vapi speaks `ai_agents.first_message` verbatim, before the model or the
 * system prompt run — so this text is the single thing a visitor is
 * guaranteed to hear, and it cannot be corrected by prompting. It has
 * regressed twice: once to a generic "Hello! Thank you for scanning my
 * business card" when the record failed to load, and once to a ~100-word
 * pitch. This test fails the build if the seeded greeting ever drifts again.
 */
describe("scripted voice greeting", () => {
  const REQUIRED_OPENING =
    "Hi. I'm Srinivasan Kandasamy from Pagalava Data Analytics. Thank you for scanning my AI business card.";

  const seedSource = readFileSync(join(process.cwd(), "scripts", "seed-pagalava.ts"), "utf8");
  const firstMessage = seedSource.match(/first_message:\s*\n?\s*"([^"]+)"/)?.[1];

  it("is present in the seed script", () => {
    expect(firstMessage).toBeDefined();
  });

  it("begins with the exact required sentences", () => {
    expect(firstMessage).toBeDefined();
    expect(firstMessage!.startsWith(REQUIRED_OPENING)).toBe(true);
  });

  it("does not open with a generic greeting", () => {
    expect(firstMessage).toBeDefined();
    // These are the specific fallbacks that have shipped by accident before.
    expect(firstMessage!).not.toMatch(/^\s*(Hello[.!,]|Hi there|How may I help)/i);
  });

  it("stays short enough to be spoken in roughly 20 seconds", () => {
    expect(firstMessage).toBeDefined();
    // ~150 words/minute conversational pace => ~50 words for 20s.
    const words = firstMessage!.trim().split(/\s+/).length;
    expect(words).toBeLessThanOrEqual(60);
  });

  it("names the company and the plug-and-play positioning", () => {
    expect(firstMessage).toBeDefined();
    expect(firstMessage!).toMatch(/Pagalava Data Analytics/);
    expect(firstMessage!).toMatch(/plug-and-play AI department/i);
  });
});
