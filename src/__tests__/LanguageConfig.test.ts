import { detectLanguageFromBrowser, getLanguageDefinition, isSupportedLanguage, SUPPORTED_LANGUAGES, DEFAULT_LANGUAGE } from "@/features/language/config";
import en from "@/features/language/locales/en.json";
import ta from "@/features/language/locales/ta.json";
import hi from "@/features/language/locales/hi.json";

describe("language config", () => {
  it("defaults to Tamil — Pagalava primarily serves Tamil Nadu", () => {
    expect(DEFAULT_LANGUAGE).toBe("ta");
  });

  it("ships exactly the three initial-release languages, Tamil first", () => {
    expect(SUPPORTED_LANGUAGES.map((l) => l.code)).toEqual(["ta", "en", "hi"]);
  });

  describe("detectLanguageFromBrowser", () => {
    it("maps an English browser locale to English", () => {
      expect(detectLanguageFromBrowser("en-US")).toBe("en");
      expect(detectLanguageFromBrowser("en-GB")).toBe("en");
      expect(detectLanguageFromBrowser("en")).toBe("en");
    });

    it("maps a Hindi browser locale to Hindi", () => {
      expect(detectLanguageFromBrowser("hi-IN")).toBe("hi");
    });

    it("maps a Tamil browser locale to Tamil", () => {
      expect(detectLanguageFromBrowser("ta-IN")).toBe("ta");
    });

    it("falls back to Tamil for an unsupported language, not English", () => {
      // The literal product requirement: Pagalava serves Tamil Nadu, so an
      // undetectable/unsupported browser language must not silently default
      // to English the way a generic i18n library would.
      expect(detectLanguageFromBrowser("fr-FR")).toBe("ta");
      expect(detectLanguageFromBrowser("de-DE")).toBe("ta");
      expect(detectLanguageFromBrowser(undefined)).toBe("ta");
    });
  });

  describe("isSupportedLanguage", () => {
    it("accepts the three shipped codes", () => {
      expect(isSupportedLanguage("ta")).toBe(true);
      expect(isSupportedLanguage("en")).toBe(true);
      expect(isSupportedLanguage("hi")).toBe(true);
    });

    it("rejects anything else, including null/undefined/empty", () => {
      expect(isSupportedLanguage("fr")).toBe(false);
      expect(isSupportedLanguage(null)).toBe(false);
      expect(isSupportedLanguage(undefined)).toBe(false);
      expect(isSupportedLanguage("")).toBe(false);
    });
  });

  it("getLanguageDefinition returns the matching Deepgram speech locale for each language", () => {
    expect(getLanguageDefinition("ta").speechLocale).toBe("ta");
    expect(getLanguageDefinition("en").speechLocale).toBe("en");
    expect(getLanguageDefinition("hi").speechLocale).toBe("hi");
  });

  describe("locale bundle completeness", () => {
    // Catches a typo'd or missing key in one of the three hand-written JSON
    // files before it ships as a visible untranslated key on the card.
    function flattenKeys(obj: unknown, prefix = ""): string[] {
      if (Array.isArray(obj)) return [prefix];
      if (obj && typeof obj === "object") {
        return Object.entries(obj as Record<string, unknown>).flatMap(([k, v]) => flattenKeys(v, prefix ? `${prefix}.${k}` : k));
      }
      return [prefix];
    }

    const enKeys = flattenKeys(en).sort();

    it("Tamil bundle has exactly the same keys as English", () => {
      expect(flattenKeys(ta).sort()).toEqual(enKeys);
    });

    it("Hindi bundle has exactly the same keys as English", () => {
      expect(flattenKeys(hi).sort()).toEqual(enKeys);
    });

    it("every bundle ships exactly three suggested questions", () => {
      expect(en.suggestedQuestions).toHaveLength(3);
      expect(ta.suggestedQuestions).toHaveLength(3);
      expect(hi.suggestedQuestions).toHaveLength(3);
    });
  });
});
