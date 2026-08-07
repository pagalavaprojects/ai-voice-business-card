import { AIAgent } from "@/core/domain/agent/AIAgent";
import { Company, Employee } from "@/core/domain/models/types";
import { substituteTemplateVariables } from "@/core/application/services/promptVariables";
import { DEFAULT_LANGUAGE, LanguageCode, SUPPORTED_LANGUAGES, getLanguageDefinition, isSupportedLanguage } from "./config";
import { getDefaultGreeting } from "./greetings";
import en from "./locales/en.json";
import ta from "./locales/ta.json";
import hi from "./locales/hi.json";

const LOCALE_BUNDLES: Record<LanguageCode, { suggestedQuestions: string[] }> = { en, ta, hi };

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

export { SUPPORTED_LANGUAGES, DEFAULT_LANGUAGE, isSupportedLanguage, getLanguageDefinition };
export type { LanguageCode };
