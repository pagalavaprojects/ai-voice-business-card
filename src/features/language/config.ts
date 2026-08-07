/**
 * The platform's supported-language catalog. This is the single source of
 * truth the UI ships with — mirrors the `languages` table's seed data
 * (migration 20260810), which exists so an admin can later toggle
 * is_active/is_default per row without a code change. Adding a language
 * here (plus its locale file, greeting, and voice mapping) is the entire
 * cost of supporting a new one — nothing else in this module branches on a
 * specific language code.
 */
export type LanguageCode = "ta" | "en" | "hi";

export interface LanguageDefinition {
  code: LanguageCode;
  /** English name, for admin/dashboard surfaces. */
  name: string;
  /** The language's own name, written in itself — what the visitor-facing
   * selector shows, per the "must feel native" requirement. */
  nativeName: string;
  /** Deepgram transcriber language code (@vapi-ai/web's DeepgramTranscriber
   * type) — confirmed to support 'ta' and 'hi' directly, not assumed. */
  speechLocale: string;
  /** OpenAI TTS voice preset for this language. All three ship on the
   * existing OpenAI path by default (zero risk to what's already live);
   * resolveVoiceProviderConfig's ElevenLabs override, when enabled, still
   * takes precedence platform-wide regardless of language. */
  voiceModel: string;
  isRtl: boolean;
}

export const SUPPORTED_LANGUAGES: readonly LanguageDefinition[] = [
  { code: "ta", name: "Tamil", nativeName: "தமிழ்", speechLocale: "ta", voiceModel: "nova", isRtl: false },
  { code: "en", name: "English", nativeName: "English", speechLocale: "en", voiceModel: "nova", isRtl: false },
  { code: "hi", name: "Hindi", nativeName: "हिन्दी", speechLocale: "hi", voiceModel: "nova", isRtl: false },
] as const;

export const DEFAULT_LANGUAGE: LanguageCode = "ta";

const SUPPORTED_CODES = new Set<string>(SUPPORTED_LANGUAGES.map((l) => l.code));

export function isSupportedLanguage(code: string | null | undefined): code is LanguageCode {
  return !!code && SUPPORTED_CODES.has(code);
}

export function getLanguageDefinition(code: LanguageCode): LanguageDefinition {
  return SUPPORTED_LANGUAGES.find((l) => l.code === code) ?? SUPPORTED_LANGUAGES[0];
}

/**
 * Resolves a visitor's starting language before they've made any explicit
 * choice — priority: stored preference (handled by the caller, not here) >
 * browser language > Tamil. Pagalava primarily serves Tamil Nadu, so an
 * undetectable/unsupported browser language falls back to Tamil rather than
 * English, a deliberate product decision, not a generic i18n default.
 */
export function detectLanguageFromBrowser(navigatorLanguage: string | undefined): LanguageCode {
  if (!navigatorLanguage) return DEFAULT_LANGUAGE;
  const primary = navigatorLanguage.slice(0, 2).toLowerCase();
  if (primary === "en") return "en";
  if (primary === "hi") return "hi";
  if (primary === "ta") return "ta";
  return DEFAULT_LANGUAGE;
}
