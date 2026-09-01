import { AIAgent } from "@/core/domain/agent/AIAgent";
import { Company, Employee } from "@/core/domain/models/types";
import { substituteTemplateVariables } from "@/core/application/services/promptVariables";
import { DEFAULT_LANGUAGE, LanguageCode, SUPPORTED_LANGUAGES, getLanguageDefinition, isSupportedLanguage } from "./config";
import { getDefaultGreeting, MAYLAANAI_INTRODUCTION, MAYLAANAI_INTRODUCTION_TA } from "./greetings";
import { DEMO_COMPANY_ID } from "@/shared/lib/demoCard";
import en from "./locales/en.json";
import ta from "./locales/ta.json";
import hi from "./locales/hi.json";
import te from "./locales/te.json";
import ml from "./locales/ml.json";
import kn from "./locales/kn.json";

const LOCALE_BUNDLES: Record<LanguageCode, { suggestedQuestions: string[] }> = { en, ta, hi, te, ml, kn };

/** Server-side counterpart to useLanguage's browser-only detection —
 * resolves the ?lang= query param a request arrives with down to one of
 * the three supported codes, defaulting to Tamil for anything else
 * (unset, malformed, or a language this release doesn't ship). */
export function resolveRequestLanguage(langParam: string | null): LanguageCode {
  return isSupportedLanguage(langParam) ? langParam : DEFAULT_LANGUAGE;
}

/**
 * The greeting Vapi will speak, in the visitor's chosen language. Priority:
 *
 * 1. This employee's own authored override for the exact language
 *    (`ai_agents.greetings[language]`).
 * 2. The existing single-language `first_message`, but ONLY when the
 *    visitor's chosen language matches what it's tagged as
 *    (`welcome_message_language`) — this is what lets an already-authored,
 *    carefully-written greeting (e.g. this platform's own ~60-70s Tamil
 *    script) keep being used verbatim for visitors who pick that same
 *    language, rather than being silently replaced by a generic one.
 * 3. The platform's generic per-language template — the only case a
 *    company that's done zero multilingual setup falls back to, for any
 *    language other than the one it already had a greeting in.
 */
export function resolveGreeting(
  agent: Pick<AIAgent, "greetings" | "first_message" | "welcome_message_language"> | null,
  company: Company,
  employee: Employee,
  language: LanguageCode
): string {
  // 0. MaylaanAI's approved English introduction — a code-authored,
  // per-company override that wins over even the DB greeting, so the
  // approved content cannot drift through dashboard edits. Returned
  // verbatim (no template substitution — the approved text contains no
  // variables and must stay byte-exact). English only: no other-language
  // version was supplied, so Tamil and the rest keep their existing
  // authored/DB/default chain below.
  if (language === "en" && company.id === DEMO_COMPANY_ID) {
    return MAYLAANAI_INTRODUCTION;
  }
  // The approved Tamil introduction — the parallel per-company override for
  // Tamil visitors (supplied 2026-09-01). Same rule as the English one:
  // code-authored, wins over any DB greeting so approved content cannot drift
  // through dashboard edits, and returned verbatim (no template substitution —
  // the approved text is byte-exact and contains no variables).
  if (language === "ta" && company.id === DEMO_COMPANY_ID) {
    return MAYLAANAI_INTRODUCTION_TA;
  }

  const override = agent?.greetings?.[language]?.trim();
  const existingMatchesLanguage = agent?.welcome_message_language === language && agent?.first_message?.trim();
  const template = override || existingMatchesLanguage || getDefaultGreeting(language);
  return substituteTemplateVariables(template, company, employee);
}

/** A short, explicit instruction appended to the assembled system prompt so
 * the model answers in the visitor's chosen language for the rest of the
 * conversation — not a parallel system prompt per language. The existing
 * company-authored prompt modules (identity/behavior/sales/etc.) stay
 * exactly as configured; only the language of the reply changes. Written in
 * English regardless of target language — an LLM instruction about which
 * language to respond in doesn't need to itself be in that language, and
 * keeping it in English keeps it reviewable/maintainable in one place. */
export function getLanguageDirective(language: LanguageCode): string {
  const def = getLanguageDefinition(language);
  return (
    `\n\n=== RESPONSE LANGUAGE ===\n` +
    `Respond entirely in ${def.name} (${def.nativeName}). Use natural, native-sounding ${def.name}, ` +
    `not a word-for-word translation from English. Do not mix in another language and do not switch ` +
    `languages mid-conversation, unless the visitor explicitly speaks to you in a different language ` +
    `or asks you to switch.`
  );
}

export type { TranscriberSpec as TranscriberConfig } from "./config";

/**
 * Resolves which speech-recognition provider/model/language a live call
 * should request, per the visitor's chosen language. The mapping itself
 * lives on each language's definition in config.ts, where every entry was
 * validated against the live Vapi account — this replaced the old
 * speechLocale/azureSpeechLocale pair after Vapi's server was observed
 * rejecting deepgram+ta/kn with a validation 400 (Deepgram's default
 * nova-2 model supports fewer languages than the SDK's type union claims),
 * which surfaced to Tamil visitors as an immediate "Voice connection
 * error". The former VAPI_AZURE_SPEECH_ENABLED gate is gone for the same
 * reason: Azure te-IN/ml-IN call creation was verified working on this
 * account, so the "unverified provider" risk the gate defended against no
 * longer exists.
 */
export function resolveTranscriberConfig(language: LanguageCode) {
  return getLanguageDefinition(language).transcriber ?? null;
}

/**
 * Suggested-question starters for the visitor's chosen language. Real FAQ
 * questions (provably answerable, company-specific) are used when they're
 * available and match the platform default authoring language — otherwise
 * a static, curated fallback list ships with each locale, translated by
 * hand rather than machine-translating arbitrary FAQ content at request
 * time (fast, reliable, no translation-quality surprises on a page that
 * must render instantly). A true multilingual FAQ system is the natural
 * next step if per-company translated questions are needed later.
 */
export function resolveSuggestedQuestions(language: LanguageCode, faqQuestions: string[]): string[] {
  if (language === "en" && faqQuestions.length > 0) return faqQuestions.slice(0, 4);
  return LOCALE_BUNDLES[language]?.suggestedQuestions ?? LOCALE_BUNDLES[DEFAULT_LANGUAGE].suggestedQuestions;
}

export interface CompanyLanguageSettings {
  defaultLanguage: LanguageCode | null;
  enabledLanguages: LanguageCode[];
}

/**
 * Reads a company's `settings.language_settings` JSONB — same
 * inherit-unless-overridden shape this app already uses for
 * voice_settings/calendar_settings. An empty/absent `enabled_languages`
 * means "no restriction, every platform language is available," not
 * "no languages are available" — the same inherit-all default as every
 * other per-company override here. Malformed or partial admin-entered
 * data degrades to "no override" per field rather than throwing, since
 * this runs on the public, unauthenticated card route where a bad value
 * must never break a visitor's card.
 */
export function resolveCompanyLanguageSettings(raw: Record<string, unknown> | null | undefined): CompanyLanguageSettings {
  const defaultLanguageRaw = raw?.default_language;
  const defaultLanguage = typeof defaultLanguageRaw === "string" && isSupportedLanguage(defaultLanguageRaw) ? defaultLanguageRaw : null;

  const enabledRaw = raw?.enabled_languages;
  const enabledLanguages = Array.isArray(enabledRaw)
    ? enabledRaw.filter((v): v is LanguageCode => typeof v === "string" && isSupportedLanguage(v))
    : [];

  return { defaultLanguage, enabledLanguages };
}

/**
 * Applies a company's enabled-language restriction to an otherwise-resolved
 * language. A visitor who lands on (via browser detection, a stored
 * preference, or an explicit ?lang=) a language the company has not
 * enabled falls back to the company's own default, then the platform
 * default — never silently to a language the company deliberately left
 * off, and never by erroring the card.
 */
export function clampToEnabledLanguages(language: LanguageCode, settings: CompanyLanguageSettings): LanguageCode {
  if (settings.enabledLanguages.length === 0 || settings.enabledLanguages.includes(language)) return language;
  if (settings.defaultLanguage && settings.enabledLanguages.includes(settings.defaultLanguage)) return settings.defaultLanguage;
  return settings.enabledLanguages[0];
}

/** The language list a visitor should actually be offered — the company's
 * enabled subset, or every platform language when unrestricted. */
export function resolveEnabledLanguageList(settings: CompanyLanguageSettings): LanguageCode[] {
  return settings.enabledLanguages.length > 0 ? settings.enabledLanguages : SUPPORTED_LANGUAGES.map((l) => l.code);
}

export { SUPPORTED_LANGUAGES, DEFAULT_LANGUAGE, isSupportedLanguage, getLanguageDefinition };
export type { LanguageCode };
