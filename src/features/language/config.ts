/**
 * The platform's supported-language catalog. This is the single source of
 * truth the UI ships with — mirrors the `languages` table's seed data
 * (migrations 20260810/20260811), which exists so an admin can later toggle
 * is_active/is_default per row without a code change. Adding a language
 * here (plus its locale file, greeting, and voice mapping) is the entire
 * cost of supporting a new one — nothing else in this module branches on a
 * specific language code.
 */
export type LanguageCode = "en" | "ta" | "hi" | "te" | "ml" | "kn";

export interface LanguageDefinition {
  code: LanguageCode;
  /** English name, for admin/dashboard surfaces. */
  name: string;
  /** The language's own name, written in itself — what the visitor-facing
   * selector shows, per the "must feel native" requirement. */
  nativeName: string;
  /** Deepgram transcriber language code (@vapi-ai/web's DeepgramTranscriber
   * type). Only set when Deepgram genuinely supports it — confirmed by
   * reading the SDK's own closed union type, not assumed. */
  speechLocale?: string;
  /**
   * Telugu and Malayalam are NOT in Deepgram's supported-language list
   * (verified against the installed SDK's type definitions — the union has
   * no 'te'/'ml' and no string escape hatch). Azure's transcriber does
   * support both ('te-IN'/'ml-IN', also verified against the SDK types),
   * so this is what useVapiSession switches providers to instead — but
   * only when Azure Speech is actually linked in Vapi's dashboard, which
   * this app cannot detect or verify itself. Until that's confirmed, these
   * two languages fall back to no transcriber override at all (Vapi's
   * platform default) rather than requesting a provider that may not be
   * configured, which would more likely fail the call outright than
   * degrade gracefully.
   */
  azureSpeechLocale?: string;
  /** OpenAI TTS voice preset for this language. All six ship on the
   * existing OpenAI path by default (zero risk to what's already live);
   * resolveVoiceProviderConfig's ElevenLabs override, when enabled, still
   * takes precedence platform-wide regardless of language. */
  voiceModel: string;
  isRtl: boolean;
  /** Single-emoji flag shown in the language-selection cards. India for
   * every Indian regional language here (they aren't separately
   * nationally-flagged), a neutral globe for English rather than tying it
   * to one English-speaking country. */
  flag: string;
  /** Reserved, not read anywhere yet — a named slot for a future
   * per-language voice provider choice (e.g. a language that should always
   * use ElevenLabs regardless of the platform-wide override), requested
   * explicitly as a forward-looking field. */
  futureVoiceProvider?: string | null;
}

export const SUPPORTED_LANGUAGES: readonly LanguageDefinition[] = [
  { code: "en", name: "English", nativeName: "English", speechLocale: "en", voiceModel: "nova", isRtl: false, flag: "🌐", futureVoiceProvider: null },
  { code: "ta", name: "Tamil", nativeName: "தமிழ்", speechLocale: "ta", voiceModel: "nova", isRtl: false, flag: "🇮🇳", futureVoiceProvider: null },
  { code: "hi", name: "Hindi", nativeName: "हिन्दी", speechLocale: "hi", voiceModel: "nova", isRtl: false, flag: "🇮🇳", futureVoiceProvider: null },
  { code: "te", name: "Telugu", nativeName: "తెలుగు", azureSpeechLocale: "te-IN", voiceModel: "nova", isRtl: false, flag: "🇮🇳", futureVoiceProvider: null },
  { code: "ml", name: "Malayalam", nativeName: "മലയാളം", azureSpeechLocale: "ml-IN", voiceModel: "nova", isRtl: false, flag: "🇮🇳", futureVoiceProvider: null },
  { code: "kn", name: "Kannada", nativeName: "ಕನ್ನಡ", speechLocale: "kn", voiceModel: "nova", isRtl: false, flag: "🇮🇳", futureVoiceProvider: null },
] as const;

export const DEFAULT_LANGUAGE: LanguageCode = "ta";

const SUPPORTED_CODES = new Set<string>(SUPPORTED_LANGUAGES.map((l) => l.code));

export function isSupportedLanguage(code: string | null | undefined): code is LanguageCode {
  return !!code && SUPPORTED_CODES.has(code);
}

export function getLanguageDefinition(code: LanguageCode): LanguageDefinition {
  return SUPPORTED_LANGUAGES.find((l) => l.code === code) ?? SUPPORTED_LANGUAGES[0];
}

/** True for every shipped language except Telugu/Malayalam, whose speech
 * recognition depends on Azure Speech being linked in Vapi's dashboard — an
 * external, unverifiable-from-here manual step. Surfaced in the UI (a small
 * note on those two cards) rather than silently shipping a degraded
 * experience with no explanation. */
export function hasConfirmedSpeechRecognition(code: LanguageCode): boolean {
  return Boolean(getLanguageDefinition(code).speechLocale);
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
  if (isSupportedLanguage(primary)) return primary;
  return DEFAULT_LANGUAGE;
}
