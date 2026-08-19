"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { DEFAULT_LANGUAGE, LanguageCode, detectLanguageFromBrowser, isSupportedLanguage } from "../config";

export interface LocaleBundle {
  loading: string;
  cardNotFound: string;
  cardNotFoundBody: string;
  cardUnavailable: string;
  cardUnavailableBody: string;
  tagline: string;
  status: Record<"availableNow" | "preparingVoice" | "playingIntroduction" | "speaking" | "thinking" | "listening", string>;
  mic: Record<
    | "talkWithAI"
    | "tapToBegin"
    | "tapToSpeak"
    | "introHelper"
    | "connectingHelper"
    | "thinkingHelper"
    | "speakingHelper"
    | "listeningHelper"
    | "tapRequiredHelper"
    | "idleHelper"
    | "nowYouCanAsk"
    | "defaultFirstMessage"
    | "connectionError"
    | "startCallError",
    string
  >;
  buttons: Record<"mute" | "unmute" | "endCall" | "bookMeeting" | "saveContact" | "contactSaved" | "shareQR" | "close", string>;
  sections: Record<"tryAsking" | "whatWeDo" | "products" | "featured" | "actionsHeading", string>;
  contact: Record<"website", string>;
  qr: Record<"title" | "instructions", string>;
  aria: Record<"callDuration" | "startCall" | "introPlaying" | "connecting" | "listening" | "speaking" | "thinking" | "chooseLanguage", string>;
  suggestedQuestions: string[];
  appointment: Record<
    | "title"
    | "stepSelectTime"
    | "stepYourDetails"
    | "stepDone"
    | "chooseSlotTitle"
    | "chooseSlotSubtitle"
    | "loadingSlots"
    | "errorRateLimited"
    | "errorSlotsGeneric"
    | "errorSlotsHintWithLink"
    | "errorSlotsHintNoLink"
    | "unconfiguredNotice"
    | "unconfiguredHintWithLink"
    | "unconfiguredHintNoLink"
    | "openCalendarLink"
    | "nextStep"
    | "enterDetailsTitle"
    | "slotSelectedLabel"
    | "fullNameLabel"
    | "fullNamePlaceholder"
    | "emailLabel"
    | "emailPlaceholder"
    | "phoneLabel"
    | "phonePlaceholder"
    | "back"
    | "booking"
    | "confirmBooking"
    | "submitErrorValidation"
    | "submitErrorInvalidTime"
    | "submitErrorUnavailable"
    | "submitErrorGeneric"
    | "submitErrorNetwork"
    | "submitErrorRateLimited"
    | "confirmedTitle"
    | "confirmedMessage"
    | "requestedTitle"
    | "requestedMessage"
    | "preferredTimeLabel"
    | "done",
    string
  >;
  gate: Record<"title" | "subtitle" | "continue" | "sttPending", string>;
  transcript: Record<"heading" | "ariaLabel" | "you" | "aiTwin", string>;
}

const STORAGE_KEY = "pagalava.language";

// Dynamic import per code, cached module-wide — a language's ~2KB bundle is
// fetched (and code-split by the bundler) only the first time it's ever
// selected, then reused for the rest of the session and by any other card
// on the same page load. This is the "lazy load language packs, cache
// translations" requirement, not a single upfront bundle-everything import.
const bundleCache = new Map<LanguageCode, LocaleBundle>();
const inFlight = new Map<LanguageCode, Promise<LocaleBundle>>();

async function loadBundle(code: LanguageCode): Promise<LocaleBundle> {
  const cached = bundleCache.get(code);
  if (cached) return cached;
  const pending = inFlight.get(code);
  if (pending) return pending;

  const promise = (async () => {
    let bundle: LocaleBundle;
    switch (code) {
      case "en":
        bundle = ((await import("../locales/en.json")) as { default: LocaleBundle }).default;
        break;
      case "hi":
        bundle = ((await import("../locales/hi.json")) as { default: LocaleBundle }).default;
        break;
      case "te":
        bundle = ((await import("../locales/te.json")) as { default: LocaleBundle }).default;
        break;
      case "ml":
        bundle = ((await import("../locales/ml.json")) as { default: LocaleBundle }).default;
        break;
      case "kn":
        bundle = ((await import("../locales/kn.json")) as { default: LocaleBundle }).default;
        break;
      case "ta":
      default:
        bundle = ((await import("../locales/ta.json")) as { default: LocaleBundle }).default;
        break;
    }
    bundleCache.set(code, bundle);
    inFlight.delete(code);
    return bundle;
  })();

  inFlight.set(code, promise);
  return promise;
}

/** Exported for the card pages' server renders (2026-08-19 FCP round):
 * the same dynamic-import loader works at request time on the server, so a
 * page that resolved the visitor's language cookie can ship the matching
 * bundle in its HTML and seed useLanguage with it. */
export { loadBundle };

function readStoredLanguage(): LanguageCode | null {
  if (typeof window === "undefined") return null;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return isSupportedLanguage(stored) ? stored : null;
  } catch {
    // Storage can throw in private-browsing modes on some browsers —
    // detection just falls back to browser language / default instead.
    return null;
  }
}

function persistLanguage(code: LanguageCode) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, code);
  } catch {
    /* best-effort — the session still works, it just won't remember next visit */
  }
  try {
    // Mirrored into a cookie so the card PAGE's server render can resolve
    // the visitor's language and ship a fully-rendered card in the HTML
    // (2026-08-19 FCP round) — localStorage is invisible to the server.
    // Same key name; one year; Lax is enough (read on top-level GETs only).
    document.cookie = `${STORAGE_KEY}=${code}; path=/; max-age=31536000; SameSite=Lax`;
  } catch {
    /* best-effort, same as above */
  }
}

function interpolate(template: string, vars?: Record<string, string>): string {
  if (!vars) return template;
  return Object.entries(vars).reduce((text, [key, value]) => text.replaceAll(`{${key}}`, value), template);
}

/**
 * Resolves and manages the visitor's chosen conversation language.
 *
 * Detection priority (only on first load, before any explicit choice):
 * 1. A stored preference from a previous visit (localStorage).
 * 2. The browser's own language.
 * 3. Tamil — Pagalava primarily serves Tamil Nadu, so an undetectable or
 *    unsupported browser language falls back to Tamil, not English.
 *
 * Starts at the platform default synchronously (safe for both server and
 * client renders) and resolves the real starting language in an effect —
 * localStorage/navigator.language are browser-only, so this can't happen
 * during the initial render without risking a server/client mismatch.
 */
export function useLanguage(initialLanguage?: LanguageCode, initialBundle?: LocaleBundle | null) {
  // When the card page's server render resolved the visitor's cookie
  // (2026-08-19 FCP round), it passes that language AND its already-loaded
  // locale bundle down as props. Seeding state from them makes the server
  // HTML and the client's first render agree exactly — full card, correct
  // language, real translations — with no fetch, no bundle round-trip, and
  // no hydration mismatch. Without the props (no cookie, or a non-SSR
  // caller) everything behaves exactly as before.
  const [language, setLanguageState] = useState<LanguageCode>(initialLanguage ?? DEFAULT_LANGUAGE);
  const [bundle, setBundle] = useState<LocaleBundle | null>(() => {
    if (initialLanguage && initialBundle) {
      // Seed the module cache too, so the bundle-loading effect below sees
      // a cache hit instead of re-importing what the HTML already carried.
      if (!bundleCache.has(initialLanguage)) bundleCache.set(initialLanguage, initialBundle);
      return initialBundle;
    }
    return bundleCache.get(initialLanguage ?? DEFAULT_LANGUAGE) ?? null;
  });
  const [isReady, setIsReady] = useState(Boolean(initialLanguage && initialBundle));
  // null until the mount effect below has actually checked localStorage —
  // callers (the pre-conversation language gate) need to tell "no
  // preference stored" apart from "haven't looked yet" so a returning
  // visitor's saved language can't flash the gate open before immediately
  // skipping it. A server-resolved cookie IS a stored preference, known
  // before mount — so the gate can be skipped in the server HTML itself.
  const [hasStoredPreference, setHasStoredPreference] = useState<boolean | null>(initialLanguage ? true : null);

  useEffect(() => {
    const stored = readStoredLanguage();
    if (initialLanguage) {
      // The cookie drove the server render. localStorage normally mirrors
      // it (persistLanguage writes both); when they disagree — cleared
      // site data, an old visit predating the cookie — localStorage is the
      // visitor's original choice and wins, at the cost of the one
      // corrective refetch the fetch effect will issue. No stored value at
      // all re-persists the cookie's language so the two stores converge.
      if (stored && stored !== initialLanguage) setLanguageState(stored);
      if (!stored) persistLanguage(initialLanguage);
      return;
    }
    const initial = stored ?? detectLanguageFromBrowser(navigator.language);
    setLanguageState(initial);
    setHasStoredPreference(stored !== null);
    // Self-heal for visitors whose preference predates the cookie mirror:
    // re-persisting the stored value writes the cookie too, so their NEXT
    // visit takes the server-rendered fast path instead of never
    // qualifying for it until they happen to switch language.
    if (stored) persistLanguage(stored);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let cancelled = false;
    setIsReady(false);
    loadBundle(language).then((loaded) => {
      if (cancelled) return;
      setBundle(loaded);
      setIsReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [language]);

  const setLanguage = useCallback((code: LanguageCode) => {
    setLanguageState(code);
    persistLanguage(code);
  }, []);

  // A nested-key path like "mic.tapToSpeak" resolves against the loaded
  // bundle; { name: "..." } style vars fill in {name}/{duration} etc.
  // Falls back to the key itself (visibly broken, not silently blank) if a
  // bundle hasn't loaded yet or a key is missing — this should never happen
  // for the three shipped languages but must never crash the card.
  const t = useCallback(
    (key: string, vars?: Record<string, string>): string => {
      if (!bundle) return key;
      const value = key.split(".").reduce<unknown>((node, part) => {
        if (node && typeof node === "object" && part in (node as Record<string, unknown>)) {
          return (node as Record<string, unknown>)[part];
        }
        return undefined;
      }, bundle);
      if (typeof value !== "string") return key;
      return interpolate(value, vars);
    },
    [bundle]
  );

  const suggestedQuestions = useMemo(() => bundle?.suggestedQuestions ?? [], [bundle]);

  return { language, setLanguage, t, isReady, suggestedQuestions, bundle, hasStoredPreference };
}
