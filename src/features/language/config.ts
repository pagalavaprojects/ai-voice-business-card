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

/** The exact transcriber spec a live Vapi call requests for a language.
 * `model` is required by Vapi for the "openai" provider and unused by the
 * others. */
export interface TranscriberSpec {
  provider: "deepgram" | "azure" | "openai";
  model?: "gpt-4o-mini-transcribe" | "gpt-4o-transcribe";
  language: string;
}

export interface LanguageDefinition {
  code: LanguageCode;
  /** English name, for admin/dashboard surfaces. */
  name: string;
  /** The language's own name, written in itself — what the visitor-facing
   * selector shows, per the "must feel native" requirement. */
  nativeName: string;
  /**
   * Which speech-recognition provider a live call requests for this
   * language. The SDK's type unions alone are NOT trustworthy here — the
   * DeepgramTranscriber union accepts "ta"/"kn", but Vapi's server rejects
   * them with a 400 because Deepgram's default nova-2 model only supports
   * a smaller set (Vapi's own validation error enumerates it: en, hi,
   * multi, …). Every entry below was validated against the live Vapi
   * account (POST /call/web returned 201, not a validation 400):
   * en/hi → Deepgram nova-2 directly; ta/kn → OpenAI's transcriber
   * (Whisper-family, both languages in its supported set); te/ml → Azure
   * Speech (te-IN/ml-IN), the one provider that covers them.
   */
  transcriber: TranscriberSpec;
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

/**
 * Display order matters: this array is what the visitor-facing selector,
 * the language gate and the admin surfaces all render in, so Tamil leads —
 * the audience is Tamil Nadu and DEFAULT_LANGUAGE has been "ta" all along.
 * Order carries no behaviour beyond presentation; every lookup here is by
 * code, and the only index used anywhere is the [0] fallback below, which
 * now agrees with DEFAULT_LANGUAGE instead of contradicting it.
 */
export const SUPPORTED_LANGUAGES: readonly LanguageDefinition[] = [
  { code: "ta", name: "Tamil", nativeName: "தமிழ்", transcriber: { provider: "openai", model: "gpt-4o-mini-transcribe", language: "ta" }, voiceModel: "nova", isRtl: false, flag: "🇮🇳", futureVoiceProvider: null },
  { code: "en", name: "English", nativeName: "English", transcriber: { provider: "deepgram", language: "en" }, voiceModel: "nova", isRtl: false, flag: "🌐", futureVoiceProvider: null },
  { code: "hi", name: "Hindi", nativeName: "हिन्दी", transcriber: { provider: "deepgram", language: "hi" }, voiceModel: "nova", isRtl: false, flag: "🇮🇳", futureVoiceProvider: null },
  { code: "te", name: "Telugu", nativeName: "తెలుగు", transcriber: { provider: "azure", language: "te-IN" }, voiceModel: "nova", isRtl: false, flag: "🇮🇳", futureVoiceProvider: null },
  { code: "ml", name: "Malayalam", nativeName: "മലയാളം", transcriber: { provider: "azure", language: "ml-IN" }, voiceModel: "nova", isRtl: false, flag: "🇮🇳", futureVoiceProvider: null },
  { code: "kn", name: "Kannada", nativeName: "ಕನ್ನಡ", transcriber: { provider: "openai", model: "gpt-4o-mini-transcribe", language: "kn" }, voiceModel: "nova", isRtl: false, flag: "🇮🇳", futureVoiceProvider: null },
] as const;

export const DEFAULT_LANGUAGE: LanguageCode = "ta";

const SUPPORTED_CODES = new Set<string>(SUPPORTED_LANGUAGES.map((l) => l.code));

export function isSupportedLanguage(code: string | null | undefined): code is LanguageCode {
  return !!code && SUPPORTED_CODES.has(code);
}

export function getLanguageDefinition(code: LanguageCode): LanguageDefinition {
  return SUPPORTED_LANGUAGES.find((l) => l.code === code) ?? SUPPORTED_LANGUAGES[0];
}

/** True for every shipped language: each one's transcriber spec above was
 * validated against the live Vapi account (call creation succeeded, no
 * validation 400), so no language ships with unverified speech
 * recognition anymore. Kept as a function (rather than deleted) so the
 * LanguageGate's "STT pending" note re-activates automatically if a future
 * language is ever added without a validated transcriber. */
export function hasConfirmedSpeechRecognition(code: LanguageCode): boolean {
  return Boolean(getLanguageDefinition(code).transcriber);
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
