/**
 * The three pre-recorded pitches are SPEAK-ONLY by design: a fixed script
 * composed deterministically from the company's own data, rendered to
 * audio server-side. These tests pin the two properties that matter most:
 * the script always reflects real data (never empty, never a template
 * artifact), and each type stays in its duration band (elevator ≈30s,
 * product ≈40s, USP ≈5s at typical TTS pace) in every supported language.
 */
import { composePitchScript, isPitchType, PITCH_TYPES, PitchSourceData, PAGALAVA_TAMIL_ELEVATOR_PITCH } from "@/features/voice/lib/pitchScripts";
import { SUPPORTED_LANGUAGES } from "@/features/language/config";
import { DEMO_COMPANY_ID } from "@/shared/lib/demoCard";

const fullData: PitchSourceData = {
  companyName: "Pagalava Data Analytics",
  employeeName: "Srinivasan Kandasamy",
  designation: "Founder",
  website: "https://pagalava.com",
  serviceNames: ["AI Voice Business Cards", "Lead Qualification", "Data Analytics"],
  services: [
    { name: "AI Voice Business Cards", description: "Replace static cards with a live AI voice employee." },
    { name: "Lead Qualification", description: "Every visitor scored automatically." },
  ],
  products: [
    { name: "VoiceCard AI", description: "An always-on AI twin for your business card. It answers in six languages." },
    { name: "Lead Engine", description: "Scores and routes every conversation." },
  ],
};

const emptyCatalog: PitchSourceData = {
  ...fullData,
  serviceNames: [],
  services: [],
  products: [],
};

describe("isPitchType", () => {
  it("accepts exactly the three pitch types and nothing else", () => {
    expect(isPitchType("elevator")).toBe(true);
    expect(isPitchType("product")).toBe(true);
    expect(isPitchType("usp")).toBe(true);
    expect(isPitchType("intro")).toBe(false);
    expect(isPitchType("")).toBe(false);
    expect(isPitchType(null)).toBe(false);
    expect(isPitchType(undefined)).toBe(false);
  });
});

describe("composePitchScript", () => {
  it.each(SUPPORTED_LANGUAGES.map((l) => l.code))("produces non-empty scripts naming the company for every type in %s", (lang) => {
    for (const type of PITCH_TYPES) {
      const script = composePitchScript(type, lang, fullData);
      expect(script.trim().length).toBeGreaterThan(0);
      expect(script).toContain(fullData.companyName);
      // Template artifacts must never reach a spoken script.
      expect(script).not.toMatch(/\{\{|undefined|null/);
    }
  });

  it("keeps the USP to a single short line (~5s of speech) in every language", () => {
    for (const lang of SUPPORTED_LANGUAGES.map((l) => l.code)) {
      const script = composePitchScript("usp", lang, fullData);
      expect(script.length).toBeLessThan(160);
    }
  });

  it("orders lengths USP < elevator < product in English — the 5s/30s/40s duration bands", () => {
    const usp = composePitchScript("usp", "en", fullData);
    const elevator = composePitchScript("elevator", "en", fullData);
    const product = composePitchScript("product", "en", fullData);
    expect(usp.length).toBeLessThan(elevator.length);
    // The English elevator/product bands, in words (~150 wpm TTS):
    const words = (s: string) => s.split(/\s+/).filter(Boolean).length;
    expect(words(elevator)).toBeGreaterThanOrEqual(50);
    expect(words(elevator)).toBeLessThanOrEqual(110);
    expect(words(product)).toBeGreaterThanOrEqual(60);
    expect(words(product)).toBeLessThanOrEqual(130);
  });

  it("mentions the elevator speaker by name and the products by name", () => {
    expect(composePitchScript("elevator", "en", fullData)).toContain("Srinivasan Kandasamy");
    const product = composePitchScript("product", "en", fullData);
    expect(product).toContain("VoiceCard AI");
    expect(product).toContain("Lead Engine");
  });

  it("only the first sentence of a product description is spoken — a full paragraph would blow the 40s band", () => {
    const product = composePitchScript("product", "en", fullData);
    expect(product).toContain("An always-on AI twin for your business card.");
    expect(product).not.toContain("It answers in six languages");
  });

  it("degrades gracefully for a company with no products or services listed", () => {
    for (const lang of SUPPORTED_LANGUAGES.map((l) => l.code)) {
      for (const type of PITCH_TYPES) {
        const script = composePitchScript(type, lang, emptyCatalog);
        expect(script.trim().length).toBeGreaterThan(0);
        expect(script).toContain(emptyCatalog.companyName);
        expect(script).not.toMatch(/\{\{|undefined|null/);
      }
    }
  });

  it("every language produces a genuinely distinct script per type — no accidental English fallback", () => {
    for (const type of PITCH_TYPES) {
      const scripts = SUPPORTED_LANGUAGES.map((l) => composePitchScript(type, l.code, fullData));
      expect(new Set(scripts).size).toBe(SUPPORTED_LANGUAGES.length);
    }
  });

  it("keeps proper nouns verbatim inside non-English frames (Tamil)", () => {
    const script = composePitchScript("elevator", "ta", fullData);
    expect(script).toContain("Srinivasan Kandasamy");
    expect(script).toContain("Pagalava Data Analytics");
    // And the frame itself is Tamil, not English:
    expect(script).toMatch(/வணக்கம்/);
  });

  describe("Pagalava's authored Tamil elevator pitch (per-company override)", () => {
    const pagalavaData: PitchSourceData = { ...fullData, companyId: DEMO_COMPANY_ID };

    it("returns the founder-supplied script VERBATIM for (elevator, ta, Pagalava)", () => {
      const script = composePitchScript("elevator", "ta", pagalavaData);
      expect(script).toBe(PAGALAVA_TAMIL_ELEVATOR_PITCH);
      // Anchor a few exact supplied phrases so any future "improvement" of
      // the founder's wording fails loudly:
      expect(script).toContain("அது உங்க தப்பு இல்ல — அந்த கார்டோட தப்பு.");
      expect(script).toContain("ஒரு AI Voice Business Card");
      expect(script).toContain("so no-show குறையும்");
      expect(script.endsWith("நன்றிகள்.")).toBe(true);
      // The supplied markdown "##" heading marker is formatting, not speech:
      expect(script).not.toContain("##");
    });

    it("does NOT leak the authored pitch to other companies, other languages, or other pitch types", () => {
      expect(composePitchScript("elevator", "ta", fullData)).not.toBe(PAGALAVA_TAMIL_ELEVATOR_PITCH);
      expect(composePitchScript("elevator", "ta", { ...fullData, companyId: "99999999-9999-9999-9999-999999999999" })).not.toBe(PAGALAVA_TAMIL_ELEVATOR_PITCH);
      expect(composePitchScript("elevator", "en", pagalavaData)).not.toBe(PAGALAVA_TAMIL_ELEVATOR_PITCH);
      expect(composePitchScript("product", "ta", pagalavaData)).not.toBe(PAGALAVA_TAMIL_ELEVATOR_PITCH);
      expect(composePitchScript("usp", "ta", pagalavaData)).not.toBe(PAGALAVA_TAMIL_ELEVATOR_PITCH);
    });
  });
});
