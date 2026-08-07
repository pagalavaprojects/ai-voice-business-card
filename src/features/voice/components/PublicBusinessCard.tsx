"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Mail, Phone, Globe, Calendar, Download, QrCode, MessageCircle, Linkedin, Link2, X, Loader2, CheckCircle2 } from "lucide-react";
import { useVapiSession } from "@/features/voice/hooks/useVapiSession";
import { VoiceMicButton } from "@/features/voice/components/VoiceMicButton";
import { Card } from "@/shared/ui/card";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Dialog } from "@/shared/ui/dialog";
import { downloadVCard, imageUrlToDataUri } from "@/features/voice/lib/vcard";
import { useLanguage } from "@/features/language/hooks/useLanguage";
import { LanguageSelector } from "@/features/language/components/LanguageSelector";
import { LanguageGate } from "@/features/language/components/LanguageGate";
import { getLanguageDefinition, isSupportedLanguage, LanguageCode } from "@/features/language/config";

import { BusinessCardSkeleton } from "@/features/voice/components/BusinessCardSkeleton";

// Code-split: TranscriptViewer and AppointmentModal are only needed after user
// interaction (transcript visible mid/post call; booking modal on button click).
// Deferring them keeps the critical-path JS bundle smaller, improving LCP and
// TTI on mobile devices and slow connections.
const TranscriptViewer = dynamic(
  () => import("@/features/voice/components/TranscriptViewer").then((m) => ({ default: m.TranscriptViewer })),
  { ssr: false, loading: () => null }
);
const AppointmentModal = dynamic(
  () => import("@/features/voice/components/AppointmentModal").then((m) => ({ default: m.AppointmentModal })),
  { ssr: false, loading: () => null }
);


interface PublicCardData {
  company: { name: string; website: string; logoUrl: string | null };
  employee: {
    name: string;
    designation: string;
    email: string;
    phone: string;
    officeAddress: string | null;
    workingHours: string | null;
    avatarUrl: string | null;
  };
  branding?: { primaryColor: string | null; secondaryColor: string | null };
  services?: Array<{
    name: string;
    description: string;
    deliverables?: string[];
    timeline?: string;
    price?: number;
    currency?: string;
    imageUrl?: string | null;
    featured?: boolean;
    cta?: { label: string; url: string } | null;
  }>;
  products?: Array<{
    name: string;
    description: string;
    benefits?: string[];
    pricing?: number;
    currency?: string;
    discountPercent?: number | null;
    imageUrl?: string | null;
    featured?: boolean;
    cta?: { label: string; url: string } | null;
  }>;
  suggestedQuestions?: string[];
  socialLinks?: Record<string, string>;
  whatsappUrl?: string | null;
  qrSvg?: string | null;
  bookingUrl?: string | null;
  firstMessage: string;
  systemPrompt?: string | null;
  tools?: unknown[];
  toolsEnabled?: boolean;
  serverUrl?: string;
  voiceId?: string;
  voiceProvider?: "openai" | "11labs";
  voiceModel?: string;
  language?: string;
  speechLocale?: string | null;
  transcriberProvider?: "deepgram" | "azure" | null;
  enabledLanguages?: LanguageCode[];
}

function formatTimer(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${s < 10 ? "0" : ""}${s}`;
}

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

/** A `tel:` URI must be dialable as-is — spacing/punctuation kept in the
 * visible label (e.g. "+91 94431 25639") is formatting for a human reader,
 * not part of the number, and some mobile dialers mis-handle it in the URI
 * itself. Strips everything but digits and a leading "+", matching the same
 * digits-only convention this app already uses for the derived WhatsApp
 * wa.me link (see toWhatsappUrl in the public card API route). */
function toTelHref(phone: string): string {
  const hasPlus = phone.trim().startsWith("+");
  const digits = phone.replace(/\D/g, "");
  return `tel:${hasPlus ? "+" : ""}${digits}`;
}

/**
 * The voice business card, shared by both public routes that can resolve to
 * one: the permanent `/{companyId}/{employeeId}` URL and the short,
 * printable `/c/{slug}` URL. Each route resolves its own identifier down to
 * a plain (companyId, employeeId) pair and renders this — so the two URLs
 * can never drift into two different card experiences.
 */
export function PublicBusinessCard({ companyId, employeeId }: { companyId: string; employeeId: string }) {
  const { language, setLanguage, t, hasStoredPreference } = useLanguage();

  // The pre-conversation language gate is shown exactly once per visitor —
  // a returning visitor (hasStoredPreference true) never sees it again,
  // and a first-time visitor's explicit "Continue" tap satisfies it for
  // the rest of this page's lifetime. hasStoredPreference stays null until
  // the localStorage check has actually run (see useLanguage), so this
  // starts "unconfirmed" rather than guessing either way.
  const [gateConfirmed, setGateConfirmed] = useState(false);
  const languageConfirmed = hasStoredPreference === true || gateConfirmed;

  // No demo/fallback identity: a business card that silently renders someone
  // else's name and speaks their pitch is worse than one that admits it
  // couldn't load. Every field below comes from the database or nothing does.
  const [card, setCard] = useState<PublicCardData | null>(null);
  const [cardLoading, setCardLoading] = useState(true);
  const [loadError, setLoadError] = useState<"notfound" | "unavailable" | null>(null);
  const [qrOpen, setQrOpen] = useState(false);
  const [savingContact, setSavingContact] = useState(false);
  const [appointmentOpen, setAppointmentOpen] = useState(false);
  const [savedContactSuccess, setSavedContactSuccess] = useState(false);

  // Refetches whenever the visitor's language changes (including the one
  // extra fetch on first load once useLanguage resolves the real starting
  // language past its synchronous Tamil default — a small, one-time,
  // accepted cost for not having to coordinate two hooks' init timing) —
  // ?lang= drives the server-resolved greeting, system-prompt language
  // directive, and suggested questions all switching together.
  useEffect(() => {
    let cancelled = false;
    // Captured once per effect run, not re-read later: this fetch's own
    // response must only ever be judged against the language IT was
    // requested for. A visitor who switches language again before this
    const controller = new AbortController();
    const requestedLanguage = language;
    setCardLoading(true);
    fetch(`/api/public/${companyId}/${employeeId}?lang=${encodeURIComponent(requestedLanguage)}`, {
      signal: controller.signal,
    })
      .then(async (res) => {
        if (res.ok) return (await res.json()) as PublicCardData;
        throw new Error(res.status === 404 ? "notfound" : "unavailable");
      })
      .then((data) => {
        if (cancelled) return;
        setCard(data);
        setLoadError(null);
        // The server clamps the requested language down to the company's
        // enabled set (see clampToEnabledLanguages) — this only ever differs
        // from what was requested when an admin has disabled the language a
        // visitor's browser had stored or just picked. Comparing against
        // `requestedLanguage` (this fetch's own request), never the live
        // `language` state — see the comment above.
        if (data.language && data.language !== requestedLanguage && isSupportedLanguage(data.language)) {
          setLanguage(data.language);
        }
      })
      .catch((err: Error) => {
        if (cancelled || err.name === "AbortError") return;
        setCard(null);
        setLoadError(err.message === "notfound" ? "notfound" : "unavailable");
      })
      .finally(() => {
        if (!cancelled) setCardLoading(false);
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [companyId, employeeId, language, setLanguage]);

  const { voiceState, isMuted, messages, durationSeconds, error, isPlayingIntro, isDemoMode, startCall, endCall, toggleMute } = useVapiSession({
    companyId,
    employeeId,
    firstMessage: card?.firstMessage,
    systemPrompt: card?.systemPrompt,
    tools: card?.tools,
    serverUrl: card?.serverUrl,
    voiceId: card?.voiceId,
    voiceProvider: card?.voiceProvider,
    voiceModel: card?.voiceModel,
    speechLocale: card?.speechLocale ?? undefined,
    transcriberProvider: card?.transcriberProvider ?? undefined,
    t,
  });

  const isCallActive = voiceState !== "idle";

  // Auto-start the moment the card is ready, so the introduction plays
  // without the visitor having to find and tap the microphone button.
  //
  // This cannot be a guarantee: every major browser requires a user gesture
  // before it will autoplay audio, and getUserMedia's own permission prompt
  // needs a response neither of us controls (confirmed against Chrome's
  // documented autoplay policy, WebKit's autoplay policy post, and a Vapi
  // community report of this exact "play() can only be initiated by a user
  // gesture" error — not assumed). So this attempts the real thing first;
  // if the browser silently refuses it, hasAutoStartFailed flips true and
  // the existing microphone button below becomes an explicit "tap to begin"
  // prompt instead of a wasted, invisible failure.
  //
  // Skipped in demo mode (no live Vapi key configured — local dev without
  // credentials): demo mode simulates the whole call client-side with no
  // real mic/WebRTC involved, so there is no autoplay policy to attempt
  // working around, and auto-firing the simulated conversation would remove
  // the one thing demo mode exists for — a developer manually previewing
  // the flow one step at a time.
  //
  // Also skipped for automated browsers (navigator.webdriver — the standard
  // signal every mainstream WebDriver/Playwright/Puppeteer-controlled
  // browser sets deliberately for exactly this kind of case). This is not
  // about showing different content to bots — the card renders identically
  // either way — it's specifically that a real getUserMedia prompt has no
  // one able to answer it in an automated context, and MDN documents that
  // an unanswered prompt's promise can hang rather than reject, which would
  // otherwise leave every automated visit (including this project's own
  // e2e suite) stuck waiting on a live Vapi WebRTC handshake that only
  // exists to be interacted with by a human.
  // Holds the `companyId:employeeId:language` this effect already
  // auto-started a call for, rather than a plain boolean — so if this same
  // component instance is ever reused for a different card (client-side
  // navigation between two public cards without a full remount), OR the
  // visitor switches language, the new identity is recognized as
  // not-yet-attempted instead of being silently skipped because *some*
  // identity already auto-started once. This is what makes a language
  // switch auto-restart the call in the new language, reusing all of this
  // effect's existing autoplay/demo-mode/automated-browser handling rather
  // than duplicating it.
  const hasAutoAttemptedForRef = useRef<string | null>(null);
  const voiceStateRef = useRef(voiceState);
  const [hasAutoStartFailed, setHasAutoStartFailed] = useState(false);
  const cardIdentity = `${companyId}:${employeeId}:${language}`;

  // A language switch mid-call ends the current call rather than trying to
  // hot-swap its transcriber/voice language — Vapi has no API for changing
  // either on a live WebRTC session. Ending it here (before the auto-start
  // effect below sees the new cardIdentity) is what lets that effect treat
  // the language change exactly like a fresh page load in the new language.
  const previousLanguageRef = useRef(language);
  useEffect(() => {
    if (previousLanguageRef.current !== language) {
      previousLanguageRef.current = language;
      if (voiceStateRef.current !== "idle") endCall();
    }
  }, [language, endCall]);

  useEffect(() => {
    voiceStateRef.current = voiceState;
  }, [voiceState]);

  useEffect(() => {
    const isAutomatedBrowser = typeof navigator !== "undefined" && navigator.webdriver === true;
    // cardLoading specifically (not just !card): a language switch keeps the
    // previous (now stale) card object in state while the new-language
    // fetch is in flight, only replacing it once that resolves — without
    // this check, cardIdentity already reflects the new language the
    // instant it changes, and this effect would immediately auto-start a
    // call using the OLD language's firstMessage/systemPrompt/speechLocale,
    // then never get a second chance to restart once the right data
    // actually arrives (hasAutoAttemptedForRef would already be set).
    if (!card || cardLoading || !languageConfirmed || isDemoMode || isAutomatedBrowser || hasAutoAttemptedForRef.current === cardIdentity) return;
    hasAutoAttemptedForRef.current = cardIdentity;

    startCall();

    // "idle" this long after attempting means the browser refused outright
    // (blocked autoplay, or start() itself rejected). "connecting" this long
    // after attempting is treated the same way rather than given more time:
    // MDN documents that an unanswered getUserMedia prompt can leave its
    // promise neither resolved nor rejected indefinitely, so a call stuck
    // waiting on a native permission dialog the visitor hasn't (or won't)
    // answer looks identical, from here, to one that silently failed. Either
    // way the honest thing is to offer the manual tap — if the visitor does
    // then answer the still-pending native prompt, isCallActive flips true
    // and clears this on its own, so offering it early never actually costs
    // anything.
    const timer = setTimeout(() => {
      if (voiceStateRef.current === "idle" || voiceStateRef.current === "connecting") setHasAutoStartFailed(true);
    }, 3500);
    return () => clearTimeout(timer);
    // startCall is intentionally omitted: it's a new function identity on
    // every render (it closes over card's fields), and re-including it here
    // would fight the hasAutoAttemptedForRef guard whose entire job is
    // "exactly once per card identity." The effect already re-evaluates
    // whenever `card` changes (including the companyId/employeeId-keyed
    // fetch's null -> loaded transition on a card switch).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card, cardLoading, cardIdentity, languageConfirmed]);

  // A real tap always clears the fallback prompt, whether or not this
  // particular call succeeds — the point was only to stop suggesting a tap
  // is still needed once one has happened.
  useEffect(() => {
    if (isCallActive) setHasAutoStartFailed(false);
  }, [isCallActive]);

  // "Online" reflects whether the AI can actually take a call right now, which
  // is always — it is not gated on the human's working hours. Those are shown
  // separately so a visitor knows when a human follow-up is likely.
  //
  // The "speaking" case has two forms: the scripted opening (isPlayingIntro,
  // set for exactly the call's first assistant utterance) reads as
  // "Introducing {Company}…", everything spoken after that reads as the
  // generic "Speaking" — matching how a human receptionist's rehearsed
  // opening line reads differently from the rest of the conversation.
  // The full state chain, in order: Loading… (card not fetched yet) →
  // Preparing Voice… (connecting) → Playing Introduction… (the scripted
  // opening, isPlayingIntro) → Listening… → Thinking… → Speaking… (any
  // later reply). "Available now" is a distinct resting state for when
  // there is no active call at all — none of the six above apply then.
  const statusLabel = useMemo(() => {
    if (voiceState === "idle") return t("status.availableNow");
    if (voiceState === "connecting") return t("status.preparingVoice");
    if (voiceState === "speaking") return isPlayingIntro ? t("status.playingIntroduction") : t("status.speaking");
    if (voiceState === "thinking") return t("status.thinking");
    return t("status.listening");
  }, [voiceState, isPlayingIntro, t]);

  if (cardLoading || hasStoredPreference === null) {
    // Kept static/language-neutral rather than routed through t(): this can
    // render before the language bundle (or even the visitor's detected
    // language) has resolved, and a raw translation key flashing on screen
    // would look broken. A bare spinner at this stage is a reasonable,
    // deliberate scoping call, not an oversight.
    //
    // hasStoredPreference === null (the localStorage check hasn't run yet)
    // is included here too — without it, a returning visitor with a saved
    // preference could see a one-frame flash of the language gate before it
    // immediately closes itself, which reads as a UI bug rather than a
    // deliberate skip.
    return <BusinessCardSkeleton />;
  }

  if (!card) {
    return (
      <main className="min-h-screen bg-[#070b12] flex items-center justify-center p-4">
        <Card className="glass-panel border-white/[0.08] p-8 rounded-3xl max-w-sm text-center space-y-3">
          <h1 className="text-lg font-bold text-slate-100">
            {loadError === "notfound" ? t("cardNotFound") : t("cardUnavailable")}
          </h1>
          <p className="text-xs text-slate-400">
            {loadError === "notfound" ? t("cardNotFoundBody") : t("cardUnavailableBody")}
          </p>
        </Card>
      </main>
    );
  }

  if (!languageConfirmed) {
    return (
      <LanguageGate
        initialLanguage={language}
        enabledLanguages={card.enabledLanguages}
        onContinue={(code) => {
          if (code !== language) setLanguage(code);
          setGateConfirmed(true);
        }}
        t={t}
      />
    );
  }

  const { company, employee } = card;
  // Plain consts, not useMemo: `card` can be null until the early returns
  // above (loading/not-found/language-gate) have already exited the
  // function, so a hook here would be called conditionally — a real Rules
  // of Hooks violation (caught by eslint's react-hooks/rules-of-hooks) that
  // would skip these hooks entirely on every one of those earlier-return
  // renders and desync hook order across renders. These computations are
  // cheap (filtering a handful of social-link entries) and don't need
  // memoizing anyway.
  const linkedIn = card.socialLinks?.linkedin || card.socialLinks?.linkedIn;
  // LinkedIn gets its own branded button below, so it's excluded here rather
  // than appearing twice — once with its icon, once as a generic link.
  const otherLinks = Object.entries(card.socialLinks ?? {}).filter(([label]) => !/^linkedin$/i.test(label));

  const contact = {
    name: employee.name,
    email: employee.email,
    phone: employee.phone,
    company: company.name,
    designation: employee.designation,
    website: company.website,
    links: Object.fromEntries(
      otherLinks
        .concat(linkedIn ? [["LinkedIn", linkedIn]] : [])
        .concat(card.whatsappUrl ? [["WhatsApp", card.whatsappUrl]] : [])
    ),
  };

  return (
    // lang + dir on the document root of this card's own content: the
    // visitor's chosen language, and the RTL flag ready for a future
    // Arabic/Hebrew addition — every string below already flows through
    // t(), so an RTL language needs no further code change here, only its
    // own locale file and this flag flipping true for it.
    <main id="main-content" lang={language} dir={getLanguageDefinition(language).isRtl ? "rtl" : "ltr"} className="min-h-screen bg-[#070b12] text-slate-100 py-6 px-4 sm:py-10">
      <div className="fixed inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
        <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-[34rem] h-[34rem] bg-sky-500/10 blur-[140px] rounded-full" />
        <div className="absolute bottom-0 right-0 w-96 h-96 bg-indigo-500/[0.07] blur-[130px] rounded-full" />
      </div>

      <div className="relative z-10 w-full max-w-lg mx-auto space-y-4 motion-safe:animate-[card-rise_0.5s_ease-out]">
        {/* ---------- Identity ---------- */}
        <Card className="relative glass-panel border-white/[0.08] shadow-2xl rounded-3xl p-6 sm:p-8 space-y-6">
          <LanguageSelector
            language={language}
            onChange={setLanguage}
            label={t("aria.chooseLanguage")}
            enabledLanguages={card.enabledLanguages}
            className="absolute right-4 top-4 sm:right-5 sm:top-5"
          />

          {company.logoUrl ? (
            // Most uploaded brand marks (this one included) are designed for a
            // light background — dark wordmark text, no transparency — and go
            // illegible pasted directly onto a dark card. A small light "chip"
            // respects the source artwork exactly as designed instead of
            // requiring every tenant's logo to be pre-edited for dark mode.
            <div className="mx-auto w-fit rounded-2xl bg-white/95 px-4 py-2.5 shadow-md">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={company.logoUrl}
                alt={`${company.name} logo`}
                className="h-12 sm:h-14 w-auto max-w-[13rem] object-contain"
                loading="eager"
                decoding="async"
              />
            </div>
          ) : (
            <p className="text-center text-[11px] uppercase tracking-[0.2em] text-slate-400 font-semibold">{company.name}</p>
          )}

          <div className="flex flex-col items-center text-center space-y-3">
            <div className="relative">
              <div className="h-32 w-32 sm:h-36 sm:w-36 rounded-full border-2 border-sky-400/40 p-1 bg-gradient-to-br from-sky-500/20 to-indigo-500/20 shadow-lg shadow-sky-500/20">
                <div className="h-full w-full rounded-full bg-slate-800 flex items-center justify-center text-3xl font-bold text-sky-400 overflow-hidden">
                  {employee.avatarUrl ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={employee.avatarUrl}
                      alt={`${employee.name}, ${employee.designation}`}
                      className="h-full w-full object-cover"
                      // Biased toward the top third rather than dead-center: a
                      // professional headshot's subject typically sits in the
                      // upper portion of a portrait-oriented photo, with the
                      // lower half given to shoulders/hands/desk — a centered
                      // crop on a circular avatar cuts off the face far more
                      // often than it helps.
                      style={{ objectPosition: "50% 22%" }}
                      // Above-the-fold and usually the largest single element on
                      // the page — lazy-loading it would delay the very thing a
                      // visitor came to see, so it's explicitly eager while the
                      // service/product thumbnails further down stay lazy.
                      loading="eager"
                      decoding="async"
                    />
                  ) : (
                    initialsOf(employee.name)
                  )}
                </div>
              </div>
              <span
                className={`absolute bottom-1.5 right-1.5 h-5 w-5 rounded-full border-2 border-[#070b12] ${
                  isCallActive ? "bg-sky-400 animate-pulse" : "bg-emerald-400"
                }`}
                aria-hidden="true"
              />
            </div>

            <div className="space-y-0.5">
              <h1 className="text-[1.75rem] sm:text-3xl font-extrabold tracking-tight text-slate-50 leading-tight">{employee.name}</h1>
              <p className="text-sm sm:text-[0.95rem] font-semibold text-sky-400">{employee.designation}</p>
              <p className="text-xs text-slate-400">{company.name}</p>
            </div>

            <Badge variant={isCallActive ? "default" : "success"} aria-live="polite" aria-atomic="true">
              ● {statusLabel}
            </Badge>
          </div>

          {/* ---------- Voice ---------- */}
          <div className="flex flex-col items-center pt-2 border-t border-white/[0.06]">
            <div className="flex items-center gap-2 mb-3 mt-5">
              {durationSeconds > 0 && (
                <span
                  className="text-xs font-mono text-slate-300 font-semibold tabular-nums"
                  aria-label={t("aria.callDuration", { duration: formatTimer(durationSeconds) })}
                >
                  {formatTimer(durationSeconds)}
                </span>
              )}
            </div>

            <VoiceMicButton
              state={voiceState}
              isMuted={isMuted}
              onClick={isCallActive ? endCall : startCall}
              ringActive={hasAutoStartFailed}
              // The mic is force-muted at the SDK level for the whole
              // scripted opening (see useVapiSession.ts) — disabling the
              // button too means there is no control on screen that looks
              // interactive but does nothing, or that could end the intro
              // early by racing the End Call action against it.
              disabled={isPlayingIntro}
              ariaLabels={{
                idle: t("aria.startCall"),
                connecting: t("aria.connecting"),
                listening: t("aria.listening"),
                speaking: t("aria.speaking"),
                thinking: t("aria.thinking"),
                disabled: t("aria.introPlaying"),
              }}
            />

            <p className="text-sm text-slate-200 text-center font-semibold mt-4">
              {isPlayingIntro
                ? t("status.playingIntroduction")
                : voiceState === "connecting"
                  ? t("status.preparingVoice")
                  : isCallActive
                    ? t("mic.tapToSpeak")
                    : hasAutoStartFailed
                      ? t("mic.tapToBegin")
                      : t("mic.talkWithAI", { name: employee.name.split(" ")[0] })}
            </p>
            <p className="text-xs text-slate-400 text-center mt-1 max-w-xs">
              {isPlayingIntro
                ? t("mic.introHelper")
                : voiceState === "connecting"
                  ? t("mic.connectingHelper")
                  : voiceState === "thinking"
                    ? t("mic.thinkingHelper")
                    : voiceState === "speaking"
                      ? t("mic.speakingHelper")
                      : voiceState === "listening"
                        ? // Exactly once per call — the moment the mic first opens
                          // (no messages yet) — before settling into the more
                          // detailed ongoing-conversation helper text below.
                          messages.length === 0
                          ? t("mic.nowYouCanAsk")
                          : t("mic.listeningHelper")
                        : hasAutoStartFailed
                          ? t("mic.tapRequiredHelper")
                          : t("mic.idleHelper")}
            </p>

            {error && (
              <div
                role="alert"
                className="mt-4 w-full p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-200 text-xs text-center"
              >
                {error}
              </div>
            )}

            {isCallActive && (
              <div className="flex gap-2 mt-4">
                {/* Hidden, not just disabled, during the intro: the mic is
                    system-muted for that whole window (see
                    useVapiSession.ts), and a visible "Unmute" control would
                    invite a tap that fights it. */}
                {!isPlayingIntro && (
                  <Button variant="outline" size="sm" onClick={toggleMute} className="text-xs">
                    {isMuted ? t("buttons.unmute") : t("buttons.mute")}
                  </Button>
                )}
                <Button variant="outline" size="sm" onClick={endCall} className="text-xs">
                  {t("buttons.endCall")}
                </Button>
              </div>
            )}
          </div>

          {/* ---------- Try asking ---------- */}
          {!isCallActive && card.suggestedQuestions && card.suggestedQuestions.length > 0 && (
            <section aria-labelledby="try-asking" className="border-t border-white/[0.06] pt-4">
              <h2 id="try-asking" className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold mb-2.5">
                {t("sections.tryAsking")}
              </h2>
              <ul className="space-y-1.5">
                {card.suggestedQuestions.map((q) => (
                  <li key={q}>
                    {/* Starts the call and leaves the question on screen to read
                        aloud. The opening line is fixed by the voice provider,
                        so pretending to "ask it for you" would be a lie. */}
                    <button
                      type="button"
                      onClick={startCall}
                      className="w-full text-left text-xs text-slate-200 bg-white/[0.04] hover:bg-white/[0.08] active:scale-[0.99] border border-white/[0.08] hover:border-sky-400/40 rounded-xl px-3 py-2.5 transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-sky-500"
                    >
                      &ldquo;{q}&rdquo;
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <TranscriptViewer messages={messages} t={t} />
        </Card>

        {/* ---------- Services ---------- */}
        {card.services && card.services.length > 0 && (
          <Card className="glass-panel border-white/[0.08] rounded-3xl p-6" aria-labelledby="services-heading">
            <h2 id="services-heading" className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold mb-3">
              {t("sections.whatWeDo")}
            </h2>
            <ul className="space-y-4">
              {card.services.map((s) => (
                <li key={s.name} className="flex gap-3">
                  {s.imageUrl && (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={s.imageUrl}
                      alt=""
                      className="h-14 w-14 rounded-xl object-cover border border-white/[0.08] shrink-0"
                      loading="lazy"
                    />
                  )}
                  <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="text-sm font-bold text-slate-100">
                      {s.name}
                      {s.featured && (
                        <span className="ml-2 text-[9px] uppercase tracking-wide text-amber-300 bg-amber-400/10 border border-amber-400/25 rounded-full px-1.5 py-0.5 align-middle">
                          {t("sections.featured")}
                        </span>
                      )}
                    </p>
                    {typeof s.price === "number" && s.price > 0 && (
                      <span className="text-xs font-mono text-sky-400 whitespace-nowrap">
                        {s.currency === "USD" ? "$" : `${s.currency ?? ""} `}
                        {s.price}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed mt-1">{s.description}</p>
                  {s.timeline && <p className="text-[11px] text-sky-400 mt-1.5 font-medium">{s.timeline}</p>}
                  {s.deliverables && s.deliverables.length > 0 && (
                    <ul className="mt-2 flex flex-wrap gap-1.5">
                      {s.deliverables.map((d) => (
                        <li key={d} className="text-[10px] text-slate-300 bg-white/[0.05] border border-white/[0.08] rounded-full px-2.5 py-1">
                          {d}
                        </li>
                      ))}
                    </ul>
                  )}
                  {s.cta && (
                    <a
                      href={s.cta.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-block mt-2 text-[11px] font-semibold text-sky-300 hover:text-sky-200 underline underline-offset-2 focus:outline-none focus:ring-2 focus:ring-sky-500 rounded"
                    >
                      {s.cta.label} &rarr;
                    </a>
                  )}
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        )}

        {/* ---------- Products ---------- */}
        {card.products && card.products.length > 0 && (
          <Card className="glass-panel border-white/[0.08] rounded-3xl p-6" aria-labelledby="products-heading">
            <h2 id="products-heading" className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold mb-3">
              {t("sections.products")}
            </h2>
            <ul className="space-y-4">
              {card.products.map((p) => (
                <li key={p.name} className="flex gap-3">
                  {p.imageUrl && (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={p.imageUrl}
                      alt=""
                      // Decorative alongside the visible name — empty alt keeps
                      // screen readers from announcing the filename.
                      className="h-14 w-14 rounded-xl object-cover border border-white/[0.08] shrink-0"
                      loading="lazy"
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="text-sm font-bold text-slate-100 truncate">
                        {p.name}
                        {p.featured && (
                          <span className="ml-2 text-[9px] uppercase tracking-wide text-amber-300 bg-amber-400/10 border border-amber-400/25 rounded-full px-1.5 py-0.5 align-middle">
                            {t("sections.featured")}
                          </span>
                        )}
                      </p>
                      {typeof p.pricing === "number" && p.pricing > 0 && (
                        <span className="text-xs font-mono text-sky-400 whitespace-nowrap">
                          {p.currency === "USD" ? "$" : `${p.currency ?? ""} `}
                          {p.pricing}
                          {p.discountPercent ? <span className="text-emerald-400 ml-1.5">−{p.discountPercent}%</span> : null}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-300 leading-relaxed mt-1">{p.description}</p>
                    {p.cta && (
                      <a
                        href={p.cta.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-block mt-2 text-[11px] font-semibold text-sky-300 hover:text-sky-200 underline underline-offset-2 focus:outline-none focus:ring-2 focus:ring-sky-500 rounded"
                      >
                        {p.cta.label} →
                      </a>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        )}

        {/* ---------- Actions ---------- */}
        <Card className="glass-panel border-white/[0.08] rounded-3xl p-6 space-y-3" aria-labelledby="actions-heading">
          <h2 id="actions-heading" className="sr-only">
            {t("sections.actionsHeading")}
          </h2>

          <Button
            variant="default"
            onClick={() => setAppointmentOpen(true)}
            className="w-full flex items-center justify-center gap-2 text-xs font-semibold shadow-lg shadow-sky-500/20"
          >
            <Calendar className="h-4 w-4" aria-hidden="true" />
            {t("buttons.bookMeeting")}
          </Button>

          <div className="grid grid-cols-2 gap-3">
            <Button
              variant="glass"
              disabled={savingContact}
              onClick={async () => {
                setSavingContact(true);
                try {
                  const [photoDataUri, logoDataUri] = await Promise.all([
                    employee.avatarUrl ? imageUrlToDataUri(employee.avatarUrl) : Promise.resolve(null),
                    company.logoUrl ? imageUrlToDataUri(company.logoUrl) : Promise.resolve(null),
                  ]);
                  downloadVCard({ ...contact, photoDataUri, logoDataUri });
                  setSavedContactSuccess(true);
                  setTimeout(() => setSavedContactSuccess(false), 3000);
                } finally {
                  setSavingContact(false);
                }
              }}
              className="w-full flex items-center justify-center gap-2 text-xs"
            >
              {savingContact ? (
                <Loader2 className="h-4 w-4 animate-spin text-sky-400" aria-hidden="true" />
              ) : savedContactSuccess ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-400" aria-hidden="true" />
              ) : (
                <Download className="h-4 w-4 text-slate-300" aria-hidden="true" />
              )}
              {savedContactSuccess ? t("buttons.contactSaved") : t("buttons.saveContact")}
            </Button>
            <Button
              variant="glass"
              onClick={() => setQrOpen(true)}
              disabled={!card.qrSvg}
              className="w-full flex items-center justify-center gap-2 text-xs"
            >
              <QrCode className="h-4 w-4 text-slate-300" aria-hidden="true" />
              {t("buttons.shareQR")}
            </Button>
          </div>

          <ul className="grid grid-cols-2 gap-2 pt-1">
            <ContactLink href={`mailto:${employee.email}`} icon={<Mail className="h-3.5 w-3.5" />} label={employee.email} />
            <ContactLink href={toTelHref(employee.phone)} icon={<Phone className="h-3.5 w-3.5" />} label={employee.phone} />
            {card.whatsappUrl && (
              <ContactLink href={card.whatsappUrl} icon={<MessageCircle className="h-3.5 w-3.5" />} label="WhatsApp" external />
            )}
            {linkedIn && <ContactLink href={linkedIn} icon={<Linkedin className="h-3.5 w-3.5" />} label="LinkedIn" external />}
            {company.website && (
              <ContactLink href={company.website} icon={<Globe className="h-3.5 w-3.5" />} label={t("contact.website")} external />
            )}
            {otherLinks.map(([label, url]) => (
              <ContactLink key={label} href={url} icon={<Link2 className="h-3.5 w-3.5" />} label={label} external />
            ))}
          </ul>
        </Card>

        <p className="text-center text-[11px] text-slate-400 font-mono pb-4">{t("tagline")}</p>
      </div>

      <Dialog open={qrOpen} onClose={() => setQrOpen(false)} title={t("qr.title")} size="sm">
        <div className="flex flex-col items-center gap-4">
          {card.qrSvg && (
            <div
              className="bg-white p-3 rounded-2xl w-56 h-56 flex items-center justify-center [&>svg]:w-full [&>svg]:h-full"
              // Generated server-side by the `qrcode` package from this card's
              // own URL — not user-supplied content.
              dangerouslySetInnerHTML={{ __html: card.qrSvg }}
            />
          )}
          <p className="text-xs text-slate-400 text-center">{t("qr.instructions", { name: employee.name })}</p>
          <Button variant="outline" size="sm" onClick={() => setQrOpen(false)} className="text-xs">
            <X className="h-3.5 w-3.5 mr-1.5" aria-hidden="true" />
            {t("buttons.close")}
          </Button>
        </div>
      </Dialog>

      <AppointmentModal
        open={appointmentOpen}
        onClose={() => setAppointmentOpen(false)}
        companyId={companyId}
        employeeId={employeeId}
        employeeName={employee.name}
        companyName={company.name}
        externalBookingUrl={card.bookingUrl}
        language={language}
        t={t}
      />
    </main>
  );
}

const ContactLink = React.memo(function ContactLink({
  href,
  icon,
  label,
  external,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  external?: boolean;
}) {
  return (
    <li>
      <a
        href={href}
        {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
        className="flex items-center gap-2 text-[11px] text-slate-300 hover:text-sky-300 bg-white/[0.04] hover:bg-white/[0.07] border border-white/[0.08] rounded-xl px-3 py-2.5 transition-colors focus:outline-none focus:ring-2 focus:ring-sky-500 truncate"
      >
        <span className="text-sky-400 shrink-0" aria-hidden="true">
          {icon}
        </span>
        <span className="truncate">{label}</span>
      </a>
    </li>
  );
});
