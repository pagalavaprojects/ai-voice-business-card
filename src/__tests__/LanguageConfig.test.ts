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

  describe("per-language transcriber specs", () => {
    // Regression for the live Tamil outage: the SDK's DeepgramTranscriber
    // type union accepts "ta"/"kn", but Vapi's server rejects them with a
    // validation 400 ("must be one of the following values for the default
    // nova-2 model: …") — which surfaced to every Tamil visitor as an
    // instant "Voice connection error" banner. This list is Vapi's own
    // enumeration from that 400 response, so the assertion below fails the
    // build if any language is ever mapped back onto Deepgram with a
    // language nova-2 cannot actually transcribe.
    const DEEPGRAM_NOVA2_LANGUAGES = new Set([
      "en", "bg", "ca", "zh", "zh-CN", "zh-HK", "zh-Hans", "zh-TW", "zh-Hant", "cs", "da", "da-DK",
      "nl", "en-US", "en-AU", "en-GB", "en-NZ", "en-IN", "et", "fi", "nl-BE", "fr", "fr-CA", "de",
      "de-CH", "el", "hi", "hu", "id", "it", "ja", "ko", "ko-KR", "lv", "lt", "ms", "multi", "no",
      "pl", "pt", "pt-BR", "ro", "ru", "sk", "es", "es-419", "sv", "sv-SE", "th", "th-TH", "tr", "uk", "vi",
    ]);

    it("never maps a language to Deepgram outside nova-2's actual supported set", () => {
      for (const lang of SUPPORTED_LANGUAGES) {
        if (lang.transcriber.provider === "deepgram") {
          expect(DEEPGRAM_NOVA2_LANGUAGES.has(lang.transcriber.language)).toBe(true);
        }
      }
    });

    it("routes Tamil and Kannada through the OpenAI transcriber with its required model field", () => {
      expect(getLanguageDefinition("ta").transcriber).toEqual({ provider: "openai", model: "gpt-4o-mini-transcribe", language: "ta" });
      expect(getLanguageDefinition("kn").transcriber).toEqual({ provider: "openai", model: "gpt-4o-mini-transcribe", language: "kn" });
    });

    it("routes Telugu and Malayalam through Azure with Indian locales", () => {
      expect(getLanguageDefinition("te").transcriber).toEqual({ provider: "azure", language: "te-IN" });
      expect(getLanguageDefinition("ml").transcriber).toEqual({ provider: "azure", language: "ml-IN" });
    });

    it("keeps English and Hindi on Deepgram (unchanged, live-verified behavior)", () => {
      expect(getLanguageDefinition("en").transcriber).toEqual({ provider: "deepgram", language: "en" });
      expect(getLanguageDefinition("hi").transcriber).toEqual({ provider: "deepgram", language: "hi" });
    });

    it("the OpenAI provider always carries its model — Vapi requires it", () => {
      for (const lang of SUPPORTED_LANGUAGES) {
        if (lang.transcriber.provider === "openai") {
          expect(lang.transcriber.model).toBeTruthy();
        }
      }
    });
  });

  describe("hasConfirmedSpeechRecognition", () => {
    it("is true for every shipped language — each transcriber spec was validated against the live Vapi account", () => {
      for (const lang of SUPPORTED_LANGUAGES) {
        expect(hasConfirmedSpeechRecognition(lang.code)).toBe(true);
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
