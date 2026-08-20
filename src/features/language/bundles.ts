import { LanguageCode } from "./config";

/**
 * Locale bundle loading, shared by the client hook (useLanguage) and the
 * card pages' SERVER renders (cardSsr).
 *
 * Lives in its own module WITHOUT "use client" for a reason learned in
 * production (2026-08-19): loadBundle originally lived inside useLanguage.ts,
 * whose "use client" directive makes every export a client-reference proxy
 * when imported from a server component — CALLING one there throws the
 * minified "n is not a function", which is exactly what took down the card
 * SSR fast path on deploy 2970834 (caught by its own fallback, invisible to
 * jest where the directive is inert). Server code must import from HERE.
 */

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
    | "startCallError"
    | "playIntroduction",
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

// Dynamic import per code, cached module-wide — a language's ~2KB bundle is
// fetched (and code-split by the bundler) only the first time it's ever
// selected, then reused for the rest of the session and by any other card
// on the same page load. This is the "lazy load language packs, cache
// translations" requirement, not a single upfront bundle-everything import.
export const bundleCache = new Map<LanguageCode, LocaleBundle>();
const inFlight = new Map<LanguageCode, Promise<LocaleBundle>>();

export async function loadBundle(code: LanguageCode): Promise<LocaleBundle> {
  const cached = bundleCache.get(code);
  if (cached) return cached;
  const pending = inFlight.get(code);
  if (pending) return pending;

  const promise = (async () => {
    let bundle: LocaleBundle;
    switch (code) {
      case "en":
        bundle = ((await import("./locales/en.json")) as { default: LocaleBundle }).default;
        break;
      case "hi":
        bundle = ((await import("./locales/hi.json")) as { default: LocaleBundle }).default;
        break;
      case "te":
        bundle = ((await import("./locales/te.json")) as { default: LocaleBundle }).default;
        break;
      case "ml":
        bundle = ((await import("./locales/ml.json")) as { default: LocaleBundle }).default;
        break;
      case "kn":
        bundle = ((await import("./locales/kn.json")) as { default: LocaleBundle }).default;
        break;
      case "ta":
      default:
        bundle = ((await import("./locales/ta.json")) as { default: LocaleBundle }).default;
        break;
    }
    bundleCache.set(code, bundle);
    inFlight.delete(code);
    return bundle;
  })();

  inFlight.set(code, promise);
  return promise;
}
