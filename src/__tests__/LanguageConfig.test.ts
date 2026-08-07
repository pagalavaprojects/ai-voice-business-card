import { detectLanguageFromBrowser, getLanguageDefinition, isSupportedLanguage, hasConfirmedSpeechRecognition, SUPPORTED_LANGUAGES, DEFAULT_LANGUAGE } from "@/features/language/config";
import en from "@/features/language/locales/en.json";
import ta from "@/features/language/locales/ta.json";
import hi from "@/features/language/locales/hi.json";
import te from "@/features/language/locales/te.json";
import ml from "@/features/language/locales/ml.json";
import kn from "@/features/language/locales/kn.json";

describe("language config", () => {
  it("defaults to Tamil — Pagalava primarily serves Tamil Nadu", () => {
    expect(DEFAULT_LANGUAGE).toBe("ta");
  });

  it("ships all 6 supported languages", () => {
    expect(SUPPORTED_LANGUAGES.map((l) => l.code)).toEqual(["en", "ta", "hi", "te", "ml", "kn"]);
  });

  describe("detectLanguageFromBrowser", () => {
    it("maps an English browser locale to English", () => {
      expect(detectLanguageFromBrowser("en-US")).toBe("en");
      expect(detectLanguageFromBrowser("en-GB")).toBe("en");
      expect(detectLanguageFromBrowser("en")).toBe("en");
    });

    it("maps each of the six supported languages to itself", () => {
      expect(detectLanguageFromBrowser("hi-IN")).toBe("hi");
      expect(detectLanguageFromBrowser("ta-IN")).toBe("ta");
      expect(detectLanguageFromBrowser("te-IN")).toBe("te");
      expect(detectLanguageFromBrowser("ml-IN")).toBe("ml");
      expect(detectLanguageFromBrowser("kn-IN")).toBe("kn");
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
    it("accepts all six shipped codes", () => {
      for (const code of ["en", "ta", "hi", "te", "ml", "kn"]) {
        expect(isSupportedLanguage(code)).toBe(true);
      }
    });

    it("rejects anything else, including null/undefined/empty", () => {
      expect(isSupportedLanguage("fr")).toBe(false);
      expect(isSupportedLanguage(null)).toBe(false);
      expect(isSupportedLanguage(undefined)).toBe(false);
      expect(isSupportedLanguage("")).toBe(false);
    });
  });

  it("getLanguageDefinition returns the matching Deepgram speech locale for the four Deepgram-supported languages", () => {
    expect(getLanguageDefinition("ta").speechLocale).toBe("ta");
    expect(getLanguageDefinition("en").speechLocale).toBe("en");
    expect(getLanguageDefinition("hi").speechLocale).toBe("hi");
    expect(getLanguageDefinition("kn").speechLocale).toBe("kn");
  });

  describe("hasConfirmedSpeechRecognition", () => {
    it("is true for the four languages Deepgram supports directly", () => {
      expect(hasConfirmedSpeechRecognition("en")).toBe(true);
      expect(hasConfirmedSpeechRecognition("ta")).toBe(true);
      expect(hasConfirmedSpeechRecognition("hi")).toBe(true);
      expect(hasConfirmedSpeechRecognition("kn")).toBe(true);
    });

    it("is false for Telugu/Malayalam — not in Deepgram's supported-language list", () => {
      // Verified against the installed @vapi-ai/web SDK's own type
      // definitions (a closed union with no 'te'/'ml' and no string escape
      // hatch), not assumed. These two route through Azure instead, gated
      // on Azure Speech actually being linked in Vapi's dashboard — see
      // resolveTranscriberConfig.
      expect(hasConfirmedSpeechRecognition("te")).toBe(false);
      expect(hasConfirmedSpeechRecognition("ml")).toBe(false);
    });

    it("every language still has an Azure or Deepgram locale defined, so none is silently unreachable", () => {
      for (const lang of SUPPORTED_LANGUAGES) {
        expect(lang.speechLocale || lang.azureSpeechLocale).toBeTruthy();
      }
    });
  });

  describe("locale bundle completeness", () => {
    // Catches a typo'd or missing key in one of the hand-written JSON files
    // before it ships as a visible untranslated key (or a raw dotted path)
    // on the live card.
    function flattenKeys(obj: unknown, prefix = ""): string[] {
      if (Array.isArray(obj)) return [prefix];
      if (obj && typeof obj === "object") {
        return Object.entries(obj as Record<string, unknown>).flatMap(([k, v]) => flattenKeys(v, prefix ? `${prefix}.${k}` : k));
      }
      return [prefix];
    }

    const enKeys = flattenKeys(en).sort();
    const bundles: Record<string, unknown> = { ta, hi, te, ml, kn };

    it.each(Object.keys(bundles))("%s bundle has exactly the same keys as English", (code) => {
      expect(flattenKeys(bundles[code]).sort()).toEqual(enKeys);
    });

    it("every bundle ships exactly three suggested questions", () => {
      for (const bundle of [en, ta, hi, te, ml, kn]) {
        expect(bundle.suggestedQuestions).toHaveLength(3);
      }
    });
  });
});
