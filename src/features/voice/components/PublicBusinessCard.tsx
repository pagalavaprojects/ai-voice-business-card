"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Mail, Phone, Globe, Calendar, Download, QrCode, MessageCircle, Linkedin, Link2, X, Loader2, CheckCircle2, Play, Pause as PauseIcon, Volume2 } from "lucide-react";
import { useVapiSession } from "@/features/voice/hooks/useVapiSession";
import { VoiceMicButton } from "@/features/voice/components/VoiceMicButton";
import { Card } from "@/shared/ui/card";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Dialog } from "@/shared/ui/dialog";
import { downloadVCard, imageUrlToDataUri } from "@/features/voice/lib/vcard";
import { speakPitchWithBrowserTts, stopBrowserTts, pauseBrowserTts, resumeBrowserTts } from "@/features/voice/lib/pitchFallback";
import { DEMO_COMPANY_ID } from "@/shared/lib/demoCard";
import { isQualificationSupportedLanguage, getQualificationCallOpening, getQualificationDirective } from "@/features/voice/lib/qualificationScript";
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
  transcriber?: { provider: string; model?: string; language: string } | null;
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

  // ---- Pre-recorded pitches (speak-only; entirely separate from the live
  // AI conversation). One shared <audio> element plays server-rendered MP3s
  // from the pitch route — no microphone, no Vapi session, no permissions.
  // "loading" covers the fetch+decode window so the tapped button shows a
  // spinner instead of appearing dead while TTS renders on a cold cache.
  const [pitchPlaying, setPitchPlaying] = useState<"elevator" | "product" | "usp" | null>(null);
  const [pitchLoading, setPitchLoading] = useState<"elevator" | "product" | "usp" | null>(null);
  const [pitchPaused, setPitchPaused] = useState(false);
  const [pitchError, setPitchError] = useState(false);
  const pitchAudioRef = useRef<HTMLAudioElement | null>(null);
  // Which engine is voicing the current pitch — the HD MP3 <audio> element
  // or the browser's speech synthesis — so Pause/Resume drives the right one.
  const pitchSourceRef = useRef<"audio" | "tts" | null>(null);

  const stopPitch = () => {
    pitchAudioRef.current?.pause();
    pitchAudioRef.current = null;
    stopBrowserTts();
    pitchSourceRef.current = null;
    setPitchPlaying(null);
    setPitchLoading(null);
    setPitchPaused(false);
  };

  // Real Pause/Resume, not stop-and-restart: the audio element keeps its
  // currentTime and speechSynthesis keeps its utterance position, so Resume
  // continues exactly where the visitor paused.
  const togglePitchPause = () => {
    if (pitchPaused) {
      if (pitchSourceRef.current === "audio") pitchAudioRef.current?.play().catch(() => stopPitch());
      else resumeBrowserTts();
      setPitchPaused(false);
    } else {
      if (pitchSourceRef.current === "audio") pitchAudioRef.current?.pause();
      else pauseBrowserTts();
      setPitchPaused(true);
    }
  };

  // Unmount must not leave a detached audio element (or a browser-TTS
  // utterance) narrating to nobody.
  useEffect(
    () => () => {
      pitchAudioRef.current?.pause();
      stopBrowserTts();
    },
    []
  );

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

  const { voiceState, isMuted, messages, durationSeconds, error, isPlayingIntro, isDemoMode, callId, startCall, endCall, toggleMute } = useVapiSession({
    companyId,
    employeeId,
    firstMessage: card?.firstMessage,
    systemPrompt: card?.systemPrompt,
    tools: card?.tools,
    serverUrl: card?.serverUrl,
    voiceId: card?.voiceId,
    voiceProvider: card?.voiceProvider,
    voiceModel: card?.voiceModel,
    transcriber: card?.transcriber ?? undefined,
    t,
  });

  const isCallActive = voiceState !== "idle";

  // Opening the card must NOT start an AI conversation anymore — no
  // microphone permission, no Vapi/WebRTC session, no getUserMedia prompt
  // merely because someone scanned the QR. The interactive AI voice now
  // starts only from an explicit tap (the mic button, or the booking
  // flow's "Start voice qualification"). What the card attempts instead,
  // once per identity, is the SPEAK-ONLY pre-recorded introduction (the
  // elevator pitch): every major browser requires a user gesture before
  // audible autoplay, so this is a best-effort attempt that fails
  // completely silently — no error banner, no fallback TTS (speech
  // synthesis is gesture-gated too), no permission prompt. When blocked,
  // the always-visible Listen controls are the manual path, exactly as the
  // autoplay policy intends.
  //
  // Skipped for automated browsers (navigator.webdriver) and demo mode —
  // same reasoning as the old auto-call: automation has no one listening,
  // and demo mode exists for manual step-by-step previewing.
  const hasAutoAttemptedForRef = useRef<string | null>(null);
  const voiceStateRef = useRef(voiceState);
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
    // fetch is in flight — attempting with the old language's pitch would
    // then permanently consume this identity's one attempt.
    if (!card || cardLoading || !languageConfirmed || isDemoMode || isAutomatedBrowser || hasAutoAttemptedForRef.current === cardIdentity) return;
    hasAutoAttemptedForRef.current = cardIdentity;

    // Best-effort, silent-on-block: play the pre-recorded elevator pitch as
    // the card's introduction. Browsers that block audible autoplay reject
    // play() — nothing else happens, no fallback chain, no error state.
    const audio = new Audio(`/api/public/${companyId}/${employeeId}/pitch?type=elevator&lang=${encodeURIComponent(language)}`);
    audio
      .play()
      .then(() => {
        stopPitch();
        pitchAudioRef.current = audio;
        pitchSourceRef.current = "audio";
        audio.onended = () => stopPitch();
        setPitchPlaying("elevator");
      })
      .catch(() => {
        // Autoplay blocked or audio unavailable — the Listen buttons are the
        // manual path, exactly as the browser's policy intends.
        audio.src = "";
      });
    // playPitch/stopPitch identities change per render; the ref guard makes
    // this run exactly once per card identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card, cardLoading, cardIdentity, languageConfirmed, isDemoMode]);

  // The live conversation and a pre-recorded pitch are two different audio
  // sources — never let them talk over each other. A call starting (mic
  // tap, suggested-question tap, or the auto-start) silences any playing
  // pitch; playPitch below does the reverse by ending an active call first.
  useEffect(() => {
    if (isCallActive) {
      pitchAudioRef.current?.pause();
      pitchAudioRef.current = null;
      setPitchPlaying(null);
      setPitchLoading(null);
    }
  }, [isCallActive]);

  const playPitch = (type: "elevator" | "product" | "usp") => {
    // Tapping the pitch that's already voicing toggles Pause/Resume; a
    // still-loading tap cancels. Tapping a different pitch switches to it.
    if (pitchPlaying === type) {
      togglePitchPause();
      return;
    }
    if (pitchLoading === type) {
      stopPitch();
      return;
    }
    stopPitch();
    setPitchError(false);
    if (voiceStateRef.current !== "idle") endCall();

    const pitchUrl = `/api/public/${companyId}/${employeeId}/pitch?type=${type}&lang=${encodeURIComponent(language)}`;

    // When the server can't produce the rendered MP3 (e.g. TTS credits
    // exhausted upstream), the pitch still speaks: fetch the composed
    // script (no TTS involved server-side) and voice it with the
    // browser's own built-in speech synthesis. Still strictly speak-only —
    // no microphone, no permission prompt, no live AI session.
    const fallbackToBrowserTts = () => {
      fetch(`${pitchUrl}&format=script`)
        .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
        .then(({ script }: { script: string }) => {
          const started = speakPitchWithBrowserTts(script, language, {
            onStart: () => {
              pitchSourceRef.current = "tts";
              setPitchLoading(null);
              setPitchPlaying(type);
            },
            onEnd: () => {
              setPitchPlaying(null);
              setPitchLoading(null);
            },
            onError: () => {
              setPitchPlaying(null);
              setPitchLoading(null);
              setPitchError(true);
            },
          });
          if (!started) {
            setPitchLoading(null);
            setPitchError(true);
          }
        })
        .catch(() => {
          setPitchLoading(null);
          setPitchError(true);
        });
    };

    const audio = new Audio(pitchUrl);
    pitchAudioRef.current = audio;
    setPitchLoading(type);
    audio.onplaying = () => {
      pitchSourceRef.current = "audio";
      setPitchLoading(null);
      setPitchPlaying(type);
      setPitchPaused(false);
    };
    audio.onended = () => stopPitch();
    audio.onerror = () => {
      pitchAudioRef.current = null;
      fallbackToBrowserTts();
    };
    audio.play().catch(() => {
      pitchAudioRef.current = null;
      fallbackToBrowserTts();
    });
  };

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
      <main id="main-content" className="min-h-screen bg-[var(--surface-0)] flex items-center justify-center p-4">
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
    <main id="main-content" lang={language} dir={getLanguageDefinition(language).isRtl ? "rtl" : "ltr"} className="min-h-screen bg-[var(--surface-0)] text-slate-100 py-6 px-4 sm:py-10">
      <div className="fixed inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
        <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-[34rem] h-[34rem] bg-sky-500/10 blur-[140px] rounded-full" />
        <div className="absolute bottom-0 right-0 w-96 h-96 bg-indigo-500/[0.07] blur-[130px] rounded-full" />
      </div>

      {/* Single centered column at every size — slightly wider on desktop so
          the card reads as a deliberate desktop layout rather than a
          stretched phone screen. */}
      <div className="relative z-10 w-full max-w-lg lg:max-w-xl mx-auto space-y-4 motion-safe:animate-[card-rise_0.5s_ease-out]">
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
                className={`absolute bottom-1.5 right-1.5 h-5 w-5 rounded-full border-2 border-[var(--surface-0)] ${
                  isCallActive ? "bg-sky-400 animate-pulse shadow-[0_0_0_3px_rgba(56,189,248,0.15),0_0_12px_2px_rgba(56,189,248,0.35)]" : "bg-emerald-400 ai-pulse-glow"
                }`}
                aria-hidden="true"
              />
            </div>

            <div className="space-y-0.5">
              <h1 className="text-[1.75rem] sm:text-3xl font-extrabold tracking-tight text-slate-50 leading-tight">{employee.name}</h1>
              <p className="text-sm sm:text-[0.95rem] font-semibold text-sky-400">{employee.designation}</p>
              <p className="text-xs text-slate-400">{company.name}</p>
            </div>

            {/* Status badge only DURING a live call — the resting card shows
                no "Available now" chip (removed by request; the card should
                present identity + listen actions, not an availability
                claim). aria-live retained for in-call state announcements. */}
            {isCallActive && (
              <Badge variant="default" aria-live="polite" aria-atomic="true">
                ● {statusLabel}
              </Badge>
            )}
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
              ringActive={false}
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

            {/* "Talk with {name}'s AI" and the idle mic-permission helper
                are removed by request — the resting card carries no heading
                or microphone messaging here. In-call state copy remains. */}
            {(isPlayingIntro || isCallActive) && (
              <p className="text-sm text-slate-200 text-center font-semibold mt-4">
                {isPlayingIntro
                  ? t("status.playingIntroduction")
                  : voiceState === "connecting"
                    ? t("status.preparingVoice")
                    : t("mic.tapToSpeak")}
              </p>
            )}
            {(isPlayingIntro || isCallActive) && (
              <p className="text-xs text-slate-400 text-center mt-1 max-w-xs">
                {isPlayingIntro
                  ? t("mic.introHelper")
                  : voiceState === "connecting"
                    ? t("mic.connectingHelper")
                    : voiceState === "thinking"
                      ? t("mic.thinkingHelper")
                      : voiceState === "speaking"
                        ? t("mic.speakingHelper")
                        : // Exactly once per call — the moment the mic first opens
                          // (no messages yet) — before settling into the more
                          // detailed ongoing-conversation helper text.
                          messages.length === 0
                          ? t("mic.nowYouCanAsk")
                          : t("mic.listeningHelper")}
              </p>
            )}

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
                    useVapiSession.ts), and a visible "Resume" control would
                    invite a tap that fights it.

                    "Pause" here pauses YOUR side of the conversation — the
                    microphone stops sending — which is the only pause Vapi's
                    live WebRTC session actually supports (there is no
                    SDK-level whole-session freeze). The label and aria text
                    say pause/resume; the session itself stays alive, exactly
                    as rendered. */}
                {!isPlayingIntro && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={toggleMute}
                    aria-label={isMuted ? t("aria.resumeVoice") : t("aria.pauseVoice")}
                    className="text-xs"
                  >
                    {isMuted ? t("buttons.resumeVoice") : t("buttons.pauseVoice")}
                  </Button>
                )}
                <Button variant="outline" size="sm" onClick={endCall} className="text-xs">
                  {t("buttons.endCall")}
                </Button>
              </div>
            )}
          </div>

          {/* ---------- Pre-recorded pitches (speak-only, no mic) ---------- */}
          <section aria-labelledby="pitch-heading" className="border-t border-white/[0.06] pt-4">
            <h2 id="pitch-heading" className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold mb-2.5 flex items-center gap-1.5">
              <Volume2 className="h-3 w-3" aria-hidden="true" />
              {t("pitch.sectionTitle")}
            </h2>
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  // Pagalava's authored Tamil elevator script (see
                  // pitchScripts.ts) runs ~90s; every other card/language
                  // keeps the ~30s composed script, so the chip must not
                  // change for them.
                  { type: "elevator" as const, label: t("pitch.elevator"), duration: language === "ta" && companyId === DEMO_COMPANY_ID ? "90s" : "30s" },
                  { type: "product" as const, label: t("pitch.product"), duration: "40s" },
                  { type: "usp" as const, label: t("pitch.usp"), duration: "5s" },
                ]
              ).map(({ type, label, duration }) => {
                const isActive = pitchPlaying === type;
                const isBuffering = pitchLoading === type;
                const isPausedHere = isActive && pitchPaused;
                return (
                  <button
                    key={type}
                    type="button"
                    data-testid={`pitch-${type}`}
                    onClick={() => playPitch(type)}
                    aria-label={
                      isPausedHere
                        ? t("pitch.resumeAria", { label })
                        : isActive || isBuffering
                          ? t("pitch.pauseAria", { label })
                          : t("pitch.playAria", { label })
                    }
                    aria-pressed={isActive}
                    className={`flex flex-col items-center gap-1.5 rounded-xl border px-2 py-3 text-center transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-sky-500 active:scale-[0.98] ${
                      isActive || isBuffering
                        ? "bg-sky-500/15 border-sky-400/50 text-sky-300"
                        : "bg-white/[0.04] hover:bg-white/[0.08] border-white/[0.08] hover:border-sky-400/40 text-slate-200"
                    }`}
                  >
                    {isBuffering ? (
                      <Loader2 className="h-4 w-4 animate-spin text-sky-400" aria-hidden="true" />
                    ) : isPausedHere ? (
                      <Play className="h-4 w-4 text-sky-400" aria-hidden="true" />
                    ) : isActive ? (
                      <PauseIcon className="h-4 w-4 text-sky-400" aria-hidden="true" />
                    ) : (
                      <Play className="h-4 w-4 text-sky-400" aria-hidden="true" />
                    )}
                    <span className="text-[11px] font-semibold leading-tight">{label}</span>
                    <span className="text-[9px] font-mono text-slate-400">~{duration}</span>
                  </button>
                );
              })}
            </div>
            {pitchError && (
              <p role="alert" className="mt-2 text-[11px] text-rose-300 text-center">
                {t("pitch.error")}
              </p>
            )}
          </section>

          <TranscriptViewer messages={messages} t={t} />
        </Card>

        {/* ---------- Actions ---------- */}
        <Card className="glass-panel border-white/[0.08] rounded-3xl p-6 space-y-3" aria-labelledby="actions-heading">
          <h2 id="actions-heading" className="sr-only">
            {t("sections.actionsHeading")}
          </h2>

          <Button
            variant="default"
            data-testid="book-meeting-button"
            onClick={() => {
              // A speaking pitch must not talk over the booking flow.
              stopPitch();
              setAppointmentOpen(true);
            }}
            className="w-full flex items-center justify-center gap-2 text-sm font-semibold py-3 rounded-xl bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 shadow-lg shadow-sky-500/25"
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
        voice={{
          voiceState,
          callId,
          // The qualification call opens with Q1 + the closed-answer
          // guidance (Tamil and English sessions — the two languages this
          // closed-ended flow is authored for) — never the founder pitch,
          // which belongs to the card/pitch experience — AND carries its
          // own systemPrompt with the closed-ended questionnaire directive
          // appended. That directive is scoped to ONLY this call: the base
          // card.systemPrompt (used by the plain mic button below,
          // unaffected here) never includes it, so a general conversation
          // is never told "this is a strict closed-ended questionnaire."
          // Every other language keeps its normal greeting.
          startCall: () =>
            startCall(
              isQualificationSupportedLanguage(language)
                ? { firstMessage: getQualificationCallOpening(language), systemPrompt: (card.systemPrompt ?? "") + getQualificationDirective(language) }
                : undefined
            ),
          endCall,
          messages,
          language,
        }}
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
