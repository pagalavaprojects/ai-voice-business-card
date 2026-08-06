import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Locks the exact scripted opening.
 *
 * Vapi speaks `ai_agents.first_message` verbatim, before the model or the
 * system prompt run — so this text is the single thing a visitor is
 * guaranteed to hear, and it cannot be corrected by prompting. This test
 * fails the build if the seeded greeting ever drifts from what was actually
 * authored and approved.
 *
 * This is intentionally a full Tamil AI-receptionist introduction (~60-70s
 * spoken) rather than the short single-sentence opener used earlier in this
 * project — a deliberate content decision (see the seed script's own
 * comment). It now plays to completion, uninterrupted, like a professional
 * receptionist's fixed announcement: firstMessageInterruptionsEnabled is
 * false and the visitor's mic is force-muted for its duration (see
 * useVapiSession.ts), a deliberate reversal of an earlier version of this
 * feature that let a visitor talk over it.
 */
describe("scripted voice greeting", () => {
  const REQUIRED_OPENING = "வணக்கம்.";

  const seedSource = readFileSync(join(process.cwd(), "scripts", "seed-pagalava.ts"), "utf8");
  const firstMessage = seedSource.match(/first_message:\s*\n?\s*"((?:[^"\\]|\\.)*)"/)?.[1]?.replace(/\\n/g, "\n");
  const welcomeLanguage = seedSource.match(/welcome_message_language:\s*"([^"]+)"/)?.[1];

  it("is present in the seed script", () => {
    expect(firstMessage).toBeDefined();
  });

  it("begins with the Tamil greeting", () => {
    expect(firstMessage).toBeDefined();
    expect(firstMessage!.startsWith(REQUIRED_OPENING)).toBe(true);
  });

  it("does not open with a generic English greeting", () => {
    expect(firstMessage).toBeDefined();
    expect(firstMessage!).not.toMatch(/^\s*(Hello[.!,]|Hi there|How may I help)/i);
  });

  it("names the company by its full legal name", () => {
    expect(firstMessage).toBeDefined();
    expect(firstMessage!).toMatch(/Pagalava Data Analytics Private Limited/);
  });

  it("lists all five core services", () => {
    expect(firstMessage).toBeDefined();
    for (const service of [
      "Customer Experience Analytics",
      "Predictive Business Intelligence",
      "Marketing Performance Optimization",
      "Operations & Bottleneck Analysis",
      "Fraud Detection & Risk Management",
    ]) {
      expect(firstMessage!).toContain(service);
    }
  });

  it("closes by handing off to the normal conversation", () => {
    expect(firstMessage).toBeDefined();
    expect(firstMessage!.trim().endsWith("இப்போது உங்களுக்கு என்ன உதவி செய்யலாம்?")).toBe(true);
  });

  it("is tagged as Tamil, so an admin editing it later knows what language they're looking at", () => {
    expect(welcomeLanguage).toBe("ta");
  });
});
