"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { DEFAULT_LANGUAGE, LanguageCode, detectLanguageFromBrowser, isSupportedLanguage } from "../config";

export interface LocaleBundle {
  loading: string;
  cardNotFound: string;
  cardNotFoundBody: string;
  cardUnavailable: string;
  cardUnavailableBody: string;
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
    | "nowYouCanAsk",
    string
  >;
  buttons: Record<"mute" | "unmute" | "endCall" | "bookMeeting" | "saveContact" | "shareQR" | "close", string>;
  sections: Record<"tryAsking" | "whatWeDo" | "products" | "featured", string>;
  contact: Record<"website", string>;
  qr: Record<"title" | "instructions", string>;
  aria: Record<"callDuration" | "startCall" | "introPlaying" | "connecting" | "listening" | "speaking" | "thinking" | "chooseLanguage", string>;
  suggestedQuestions: string[];
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
export function useLanguage() {
  const [language, setLanguageState] = useState<LanguageCode>(DEFAULT_LANGUAGE);
  const [bundle, setBundle] = useState<LocaleBundle | null>(bundleCache.get(DEFAULT_LANGUAGE) ?? null);
  const [isReady, setIsReady] = useState(false);
  // null until the mount effect below has actually checked localStorage —
  // callers (the pre-conversation language gate) need to tell "no
  // preference stored" apart from "haven't looked yet" so a returning
  // visitor's saved language can't flash the gate open before immediately
  // skipping it.
  const [hasStoredPreference, setHasStoredPreference] = useState<boolean | null>(null);

  useEffect(() => {
    const stored = readStoredLanguage();
    const initial = stored ?? detectLanguageFromBrowser(navigator.language);
    setLanguageState(initial);
    setHasStoredPreference(stored !== null);
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
