"use client";

import React, { useEffect, useRef, useState } from "react";
import { Clock, User, Mail, Phone, CheckCircle2, ArrowRight, Loader2, AlertTriangle, Globe, Mic } from "lucide-react";
import { Dialog } from "@/shared/ui/dialog";
import { Button } from "@/shared/ui/button";
import { Skeleton } from "@/shared/ui/skeleton";
import type { LanguageCode } from "@/features/language/config";
import {
  buildAppointmentConfirmedSpeech,
  getAllQuestions,
  getAuthoredQuestion,
  getQualificationQuestions,
  matchAuthoredQuestion,
  toQualificationLanguage,
} from "@/features/voice/lib/qualificationScript";
import { speakPitchWithBrowserTts } from "@/features/voice/lib/pitchFallback";

interface AppointmentModalProps {
  open: boolean;
  onClose: () => void;
  companyId: string;
  employeeId: string;
  employeeName: string;
  companyName: string;
  externalBookingUrl?: string | null;
  /** The visitor's chosen language and translator — passed down from
   * PublicBusinessCard (the single place useLanguage() is called) rather
   * than calling the hook again here, so this modal's language state can
   * never drift from the rest of the card's. */
  language: LanguageCode;
  t: (key: string, vars?: Record<string, string>) => string;
  /** The card's live AI voice session, lent to this modal for the
   * qualification-first booking flow. When present, "Book an Appointment"
   * opens on a voice-qualification step BEFORE slot selection: the visitor
   * explicitly starts the AI conversation (microphone/Vapi are never
   * initialized merely by opening the modal), the conversation qualifies
   * them through the six authoritative questions (get_next_qualification_
   * question), and this modal polls the qualification-status endpoint
   * (keyed by the live callId) for completion. The visitor is never
   * trapped: a skip control is always available regardless of progress.
   * Absent (older callers/tests), the modal behaves exactly as before,
   * opening directly on slot selection. */
  voice?: {
    voiceState: string;
    callId: string | null;
    startCall: () => void;
    endCall: () => void;
    /** Live conversation transcript (assistant + visitor) from the session
     * — the qualification panel renders the current question and the
     * visitor's REAL answers from this. Never fabricated. */
    messages?: Array<{ role: "assistant" | "user"; content: string }>;
    /** The session's own (already-localized) error text. Without this the
     * card's error alert renders BEHIND the modal backdrop, so a failed
     * start (mic denied, connection error) left the modal showing Q1 with
     * no hint anything went wrong. */
    error?: string | null;
  };
}

interface CalcomSlot {
  time: string;
}

type BookingOutcome = { confirmed: boolean };

/**
 * Real appointment booking, not a UI mockup — fetches genuine availability
 * from GET /api/public/{companyId}/{employeeId}/appointments and books
 * through the exact same save_lead + book_appointment tools the live voice
 * call uses (see that route for why). A prior version of this component
 * used a hardcoded slot list and a setTimeout(...) that always reported
 * "Appointment confirmed" — nothing was ever booked and no email was ever
 * sent. This version never claims a confirmation the backend didn't
 * actually report.
 *
 * Every visible string routes through t() — the very first version of this
 * rewrite (this project's own Phase 14) shipped 100% hardcoded English with
 * zero calls to the translation system, which a Tamil/Hindi/Telugu/
 * Malayalam/Kannada visitor would have seen regardless of their chosen
 * language. The server's own result `message` field (English, meant for
 * the voice AI's tool-call result — the LLM paraphrases it into the
 * visitor's language when speaking) is deliberately NOT rendered here;
 * this modal derives its own localized copy from the `confirmed` boolean
 * and HTTP status instead, since there is no LLM in this path to
 * naturally re-express an English sentence in another language.
 */
export const AppointmentModal: React.FC<AppointmentModalProps> = ({
  open,
  onClose,
  companyId,
  employeeId,
  employeeName,
  companyName,
  externalBookingUrl,
  language,
  t,
  voice,
}) => {
  // Step 0 (voice qualification) exists only when a live session was lent
  // to us; without one the flow starts on slot selection as it always did.
  const [step, setStep] = useState<0 | 1 | 2 | 3>(voice ? 0 : 1);
  const [qualStage, setQualStage] = useState<"intro" | "active">("intro");
  // True once the visitor has answered all six authoritative questions
  // (the server's qualification-status endpoint reports this directly —
  // completion is no longer inferred from a lead-scoring byproduct).
  const [qualComplete, setQualComplete] = useState(false);
  // Per-question answer records from the server (question number,
  // YES/NO/MAYBE, ENGLISH transcript) — the transcript shown to the
  // visitor is English-only by product rule; raw Tamil ASR is never
  // rendered. These come from what the sequencing tool actually persisted,
  // so nothing displayed was ever invented client-side.
  const [qualAnswers, setQualAnswers] = useState<Array<{ n: number; c: string; a: string }>>([]);
  const qualStageRef = useRef(qualStage);
  qualStageRef.current = qualStage;
  // Which callId the qualification-status poll is CURRENTLY set up for —
  // lets a stale response from an ended/replaced call recognize itself as
  // stale and discard, even though clearing the poll's interval can never
  // cancel a fetch already in flight. See the poll effect below.
  const activeCallIdRef = useRef<string | null>(null);
  const [slots, setSlots] = useState<CalcomSlot[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  // Distinguishes WHY the slot list is empty — "unconfigured" (this company
  // genuinely has no online booking set up) reads very differently to a
  // visitor than "error" (a transient Cal.com outage, try again shortly).
  // Conflating the two previously meant a real outage got misreported as
  // "this company doesn't support online booking," which isn't true.
  const [slotsReason, setSlotsReason] = useState<"unconfigured" | "error" | "rate_limited" | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [formData, setFormData] = useState({ name: "", email: "", phone: "" });
  const [submitting, setSubmitting] = useState(false);
  // Bumped on every close/reset. A booking POST that resolves AFTER the
  // visitor closed the modal must not re-apply its outcome on top of the
  // freshly reset state — without this, the next open landed on the Done
  // screen for a booking whose details the visitor never saw confirmed.
  const bookingSessionRef = useRef(0);
  // One-shot per booking: the spoken confirmation must not replay on every
  // re-render of the Done step (or on a reopen that restores step 3).
  const spokenConfirmationRef = useRef(false);
  // A translation KEY, not display text — resolved through t() at render
  // time, same reasoning as `outcome` below: the server's raw HTTP status
  // maps to one of a fixed set of localized messages, never the server's
  // own English string.
  const [submitErrorKey, setSubmitErrorKey] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<BookingOutcome | null>(null);

  // After a REAL confirmed booking (never REQUESTED, never an error), the
  // AI voice speaks the approved closing — headline, thank-you line, and
  // the actually-booked slot. By the time the modal books, the live Vapi
  // call has already ended (advanceToSlots), so browser speech synthesis
  // is the voice here — same engine as the pitch fallback. The spoken text
  // is the product-approved ENGLISH wording regardless of card language
  // (same product rule as the English-only qualification script); the
  // visual Done step stays localized. One-shot per booking via the ref;
  // best-effort: a browser without speechSynthesis simply stays silent.
  useEffect(() => {
    if (step !== 3 || !outcome?.confirmed || !selectedSlot || spokenConfirmationRef.current) return;
    spokenConfirmationRef.current = true;
    const when = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(
      new Date(selectedSlot)
    );
    speakPitchWithBrowserTts(buildAppointmentConfirmedSpeech(when), "en", {
      onStart: () => undefined,
      onEnd: () => undefined,
      onError: () => undefined,
    });
  }, [step, outcome, selectedSlot]);

  // Real availability, fetched fresh every time the modal opens — a slot
  // list cached across opens could go stale within the same visit. Closing
  // the modal aborts the in-flight request outright (2026-08-19 perf
  // round): a response landing after close previously wrote slot state into
  // a modal nobody could see, and the NEXT open would flash it before its
  // own fresh fetch replaced it.
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setSlotsLoading(true);
    setSlotsReason(null);
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    fetch(`/api/public/${companyId}/${employeeId}/appointments?timeZone=${encodeURIComponent(timeZone)}`, {
      signal: controller.signal,
    })
      // The route always returns a JSON body — including on 429 — so parse
      // it regardless of status rather than throwing away the `reason`
      // field on a non-2xx response.
      .then((res) => res.json())
      .then((data: { slots?: CalcomSlot[]; reason?: "unconfigured" | "error" | "rate_limited" }) => {
        const list = data.slots ?? [];
        setSlots(list);
        setSelectedSlot(list[0]?.time ?? null);
        setSlotsReason(list.length === 0 ? data.reason ?? "error" : null);
        setSlotsLoading(false);
      })
      // Only an abort (close) or a genuine network-level failure (offline,
      // DNS, CORS) reaches here — anything the server itself responded to
      // is handled above. An abort sets no state at all: the modal is gone,
      // and the next open starts from its own clean loading state.
      .catch((err: Error) => {
        if (err?.name === "AbortError") return;
        setSlotsReason("error");
        setSlotsLoading(false);
      });
    return () => controller.abort();
  }, [open, companyId, employeeId]);

  // `language` (a BCP-47 primary subtag: en/ta/hi/te/ml/kn) is a valid
  // Intl locale on its own, so the date renders in the visitor's own
  // script/numerals/word order wherever the runtime's ICU data supports
  // it, not just translated labels around an English-formatted date.
  const formatSlot = (iso: string) =>
    new Intl.DateTimeFormat(language, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(
      new Date(iso)
    );

  const handleBook = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSlot) return;
    const session = bookingSessionRef.current;
    setSubmitting(true);
    setSubmitErrorKey(null);
    try {
      const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const res = await fetch(`/api/public/${companyId}/${employeeId}/appointments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formData.name,
          email: formData.email,
          phone: formData.phone,
          startTime: selectedSlot,
          timeZone,
          language,
        }),
      });
      const data = await res.json();
      // The visitor closed the modal while this was in flight — the reset
      // state below this point belongs to the NEXT open, not this booking.
      if (bookingSessionRef.current !== session) return;
      if (!res.ok || !data.success) {
        setSubmitErrorKey(
          res.status === 429
            ? "appointment.submitErrorRateLimited"
            : res.status === 400
              ? "appointment.submitErrorValidation"
              : res.status === 503
                ? "appointment.submitErrorUnavailable"
                : "appointment.submitErrorGeneric"
        );
        return;
      }
      // Only the honest `confirmed` boolean carries through — never the
      // server's raw English `message` string (see the component doc
      // comment above for why).
      setOutcome({ confirmed: Boolean(data.confirmed) });
      setStep(3);
    } catch {
      if (bookingSessionRef.current === session) setSubmitErrorKey("appointment.submitErrorNetwork");
    } finally {
      setSubmitting(false);
    }
  };

  // Polls qualification progress while the conversation is live. The
  // interval is modest (3s) and stops itself the moment the modal closes,
  // the step advances, OR qualification completes — once qualComplete is
  // true the answers array already holds all six records and nothing
  // further can change (the directive routes Q6's completion straight to
  // booking, never back through this tool), so continuing to poll is pure
  // waste until the visitor gets around to clicking Continue.
  useEffect(() => {
    if (!open || step !== 0 || qualStage !== "active" || qualComplete || !voice?.callId) return;
    // callId guard: a close-then-reopen (or a reconnect that hands out a new
    // Vapi call) starts a NEW effect invocation, but does nothing to cancel
    // a fetch already in flight from the PREVIOUS one — clearInterval only
    // stops future ticks, never an already-issued request. If that stale
    // request resolves after the new session has started, it would silently
    // apply the ENDED call's answers on top of the NEW call's (freshly
    // empty) state, showing the visitor someone else's — or their own
    // previous, abandoned — answers as if they belonged to the call
    // actually in progress. activeCallIdRef always holds whichever callId
    // the effect is CURRENTLY set up for, so a response is discarded
    // outright the moment it no longer matches, regardless of its own
    // sequence number.
    const callIdForThisEffect = voice.callId;
    activeCallIdRef.current = callIdForThisEffect;
    // Sequence guard against out-of-order responses WITHIN this same call:
    // each tick's fetch can resolve in any order relative to the others
    // (normal network jitter — no server-side change makes this
    // impossible). Without this, a slow EARLIER request resolving AFTER a
    // fast LATER one overwrites qualAnswers with stale data, visibly
    // regressing the displayed question/progress even though the server's
    // actual state only ever moved forward. A response is applied only if
    // no later-issued request has already been applied.
    let requestSeq = 0;
    let latestAppliedSeq = 0;
    // Single-flight + failure backoff + hard cancellation (2026-08-19 perf
    // round): a tick is skipped while the previous request is still in
    // flight (a slow network must never stack concurrent status requests —
    // the sequence guard made stacking safe, this makes it not happen);
    // consecutive failures skip 1/3/7… ticks (capped ~24s) so an outage
    // isn't hammered at full cadence; and cleanup aborts the in-flight
    // request outright instead of merely discarding its result.
    let inFlight = false;
    let consecutiveFailures = 0;
    let skipTicks = 0;
    const controller = new AbortController();
    const tick = () => {
      if (inFlight) return;
      if (skipTicks > 0) {
        skipTicks--;
        return;
      }
      const thisSeq = ++requestSeq;
      inFlight = true;
      fetch(`/api/public/${companyId}/${employeeId}/qualification-status?callId=${encodeURIComponent(callIdForThisEffect)}`, {
        signal: controller.signal,
      })
        .then((res) => (res.ok ? (res.json() as Promise<{ qualified?: boolean; answers?: Array<{ n: number; c: string; a: string }> }>) : Promise.reject(new Error(`status ${res.status}`))))
        .then((data) => {
          consecutiveFailures = 0;
          if (activeCallIdRef.current !== callIdForThisEffect) return;
          if (thisSeq < latestAppliedSeq) return;
          latestAppliedSeq = thisSeq;
          if (data?.qualified) setQualComplete(true);
          if (Array.isArray(data?.answers)) setQualAnswers(data.answers);
        })
        .catch((err: Error) => {
          if (err?.name === "AbortError") return;
          consecutiveFailures++;
          skipTicks = Math.min(2 ** consecutiveFailures - 1, 8);
        })
        .finally(() => {
          inFlight = false;
        });
    };
    // Immediate first fetch — a reopened modal (or one opened mid-call)
    // shows real progress now, not after the first 3s interval elapses.
    tick();
    const timer = setInterval(tick, 3000);
    return () => {
      clearInterval(timer);
      controller.abort();
    };
  }, [open, step, qualStage, qualComplete, voice?.callId, companyId, employeeId]);

  const advanceToSlots = () => {
    // The visitor is done talking (or never wanted to) — the mic must not
    // stay hot while they read slots and type contact details.
    if (qualStageRef.current === "active") voice?.endCall();
    // Invalidates any poll response still in flight for the call just left
    // behind: clearing the interval (the poll effect's own cleanup, fired
    // by `step` leaving 0) only stops FUTURE ticks, never an
    // already-issued fetch. Without this, that fetch could still resolve
    // a moment later and silently repopulate qualAnswers/qualComplete for
    // a step the visitor has already moved past — the same class of bug
    // the cross-call activeCallIdRef guard covers, but for the "no new
    // call has started yet" case that guard alone doesn't reach.
    activeCallIdRef.current = null;
    setStep(1);
  };

  const handleReset = () => {
    if (qualStageRef.current === "active") voice?.endCall();
    activeCallIdRef.current = null;
    // Invalidates any booking POST still in flight (see bookingSessionRef).
    bookingSessionRef.current++;
    spokenConfirmationRef.current = false;
    setStep(voice ? 0 : 1);
    setQualStage("intro");
    setQualComplete(false);
    setQualAnswers([]);
    setFormData({ name: "", email: "", phone: "" });
    setOutcome(null);
    setSubmitErrorKey(null);
    onClose();
  };

  return (
    <Dialog open={open} onClose={handleReset} title={t("appointment.title")} size="md" closeLabel={t("buttons.close")}>
      <div className="space-y-6">
        {/* Progress Bar — the Qualify step appears only when this modal was
            lent a live voice session. */}
        <div className="flex items-center justify-between border-b border-white/[0.08] pb-4 overflow-x-auto">
          {(voice
            ? ([
                { at: 0 as const, label: t("appointment.stepQualify") },
                { at: 1 as const, label: t("appointment.stepSelectTime") },
                { at: 2 as const, label: t("appointment.stepYourDetails") },
                { at: 3 as const, label: t("appointment.stepDone") },
              ])
            : ([
                { at: 1 as const, label: t("appointment.stepSelectTime") },
                { at: 2 as const, label: t("appointment.stepYourDetails") },
                { at: 3 as const, label: t("appointment.stepDone") },
              ])
          ).map((s, i, arr) => (
            <React.Fragment key={s.at}>
              <div className="flex items-center gap-2 shrink-0">
                <span
                  className={`h-6 w-6 rounded-full text-xs font-bold flex items-center justify-center ${
                    s.at === 3 ? (step === 3 ? "bg-emerald-500 text-white" : "bg-slate-800 text-slate-400") : step >= s.at ? "bg-sky-500 text-white" : "bg-slate-800 text-slate-400"
                  }`}
                >
                  {i + 1}
                </span>
                {/* Labels hide below `sm` — at 390px wide the full 4-label row
                    (longest: "Conversation with AI") overflows its own
                    horizontally-scrolling container with no visible scroll
                    affordance, silently clipping "Your Details"/"Done".
                    Numbered circles + connectors alone are a standard,
                    self-explanatory stepper pattern once labels don't fit. */}
                <span
                  className={`hidden sm:inline text-xs font-semibold ${s.at === 3 ? (step === 3 ? "text-emerald-400" : "text-slate-500") : step >= s.at ? "text-slate-200" : "text-slate-500"}`}
                >
                  {s.label}
                </span>
              </div>
              {i < arr.length - 1 && <div className="h-0.5 w-6 bg-slate-800 shrink-0 mx-1" />}
            </React.Fragment>
          ))}
        </div>

        {/* Step 0: Voice qualification — interactive AI, started only by an
            explicit tap; opening the modal never touches the microphone. */}
        {step === 0 && voice && (
          <div className="space-y-4">
            {qualStage === "intro" && (
              <Button
                variant="default"
                data-testid="start-qualification"
                onClick={() => {
                  setQualStage("active");
                  voice.startCall();
                }}
                className="w-full flex items-center justify-center gap-2 text-xs font-semibold"
              >
                <Mic className="h-4 w-4" aria-hidden="true" />
                {t("appointment.qualifyStart")}
              </Button>
            )}

            {qualStage === "active" && (
              <div className="p-4 rounded-xl bg-white/[0.04] border border-white/[0.08] space-y-3">
                {/* The conversation itself — never just a bare "Listening…".
                    The AI line shows the AUTHORITATIVE authored question:
                    seeded with Q1 (it IS the call's opening line), advanced
                    when a live assistant transcript matches the next
                    authored question — the exact authored wording is always
                    what renders, never an ASR paraphrase. The visitor line
                    is their REAL transcript only; nothing is ever invented. */}
                {(() => {
                  const msgs = voice.messages ?? [];
                  // The qualification language follows the selected card
                  // language (en/ta authored sets; anything else English) —
                  // the SAME mapping the call's firstMessage/systemPrompt
                  // and the server's sequencing tool use, so the rendered
                  // question always matches what is actually being spoken.
                  const qualLang = toQualificationLanguage(language);
                  const questions = getQualificationQuestions(qualLang);
                  const allQuestionTexts = getAllQuestions(qualLang);
                  // CURRENT question: the last assistant utterance that
                  // matches an authored question — displayed in the exact
                  // AUTHORED wording, never an ASR paraphrase. Seeded with
                  // Q1 (it IS the call's opening line). Falls forward to the
                  // next expected question when the server's answer records
                  // are ahead of the transcript events.
                  let currentQuestion: string | null = questions[0].question;
                  for (let i = msgs.length - 1; i >= 0; i--) {
                    if (msgs[i].role !== "assistant") continue;
                    const matched = matchAuthoredQuestion(msgs[i].content, qualLang);
                    if (matched) {
                      currentQuestion = matched;
                      break;
                    }
                  }
                  const maxAnswered = qualAnswers.reduce((m, a) => Math.max(m, a.n), 0);
                  const currentNum = currentQuestion ? allQuestionTexts.indexOf(currentQuestion) + 1 : 0;
                  if (maxAnswered > 0 && currentNum > 0 && currentNum <= maxAnswered) {
                    const next = questions.find((q) => q.number > maxAnswered);
                    if (next) currentQuestion = next.question;
                  }
                  const qNum = currentQuestion ? questions.find((q) => q.question === currentQuestion)?.number ?? 0 : 0;
                  const latestAssistant = [...msgs].reverse().find((m) => m.role === "assistant");
                  const aiLine = currentQuestion ?? latestAssistant?.content ?? null;
                  return (
                    <div className="space-y-2.5" data-testid="qualification-conversation">
                      {qNum > 0 && (
                        <p className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold" data-testid="qual-progress">
                          {t("appointment.qualifyProgress", { n: String(qNum), total: String(questions.length) })}
                        </p>
                      )}
                      {/* Answered questions: the authored question + the
                          visitor's answer + its YES/NO/MAYBE tag, exactly as
                          the server recorded them — never reconstructed or
                          invented client-side. */}
                      {qualAnswers.length > 0 && (
                        <div>
                          <p className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold mb-1" data-testid="qual-transcript-heading">
                            {t("transcript.heading", { count: String(qualAnswers.length) })}
                          </p>
                          <div className="space-y-2 max-h-36 overflow-y-auto pr-1" data-testid="qual-history">
                            {qualAnswers.map((ans) => {
                              const authored = getAuthoredQuestion(ans.n, toQualificationLanguage(language));
                              const accentBorder =
                                ans.c === "YES" ? "border-emerald-400/40" : ans.c === "NO" ? "border-rose-400/40" : "border-amber-400/40";
                              return (
                                <div key={ans.n} className={`border-l-2 ${accentBorder} pl-2.5`}>
                                  {authored && (
                                    <p className="text-[11px] text-slate-400 leading-snug" lang={toQualificationLanguage(language)}>
                                      {authored.question}
                                    </p>
                                  )}
                                  {/* Closed-ended spec: the English record is ONLY the
                                      classification — never model-generated content. */}
                                  <p className="text-[11px] text-slate-200 leading-snug mt-0.5" data-testid={`answer-${ans.n}`}>
                                    <span className="text-slate-400 font-semibold mr-1.5">User:</span>
                                    <span
                                      className={`inline-block px-1.5 py-0.5 rounded-full text-[9px] font-bold align-middle border ${
                                        ans.c === "YES"
                                          ? "bg-emerald-500/10 text-emerald-300 border-emerald-400/30"
                                          : ans.c === "NO"
                                            ? "bg-rose-500/10 text-rose-300 border-rose-400/30"
                                            : "bg-amber-500/10 text-amber-300 border-amber-400/30"
                                      }`}
                                    >
                                      {ans.c}
                                    </span>
                                  </p>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                      {aiLine && (
                        <div>
                          <p className="text-[10px] uppercase tracking-wider text-sky-400 font-semibold mb-1">{t("transcript.aiTwin")}</p>
                          <p className="text-sm text-slate-100 leading-relaxed" data-testid="current-question" lang={toQualificationLanguage(language)}>
                            {aiLine}
                          </p>
                        </div>
                      )}
                    </div>
                  );
                })()}

                <div className="flex items-center gap-2.5 pt-2 border-t border-white/[0.06]">
                  <span className={`h-2.5 w-2.5 rounded-full ${voice.voiceState === "idle" ? "bg-slate-500" : "bg-sky-400 animate-pulse"}`} aria-hidden="true" />
                  <span className="text-xs font-semibold text-slate-200" data-testid="qual-status" aria-live="polite">
                    {voice.voiceState === "connecting" || voice.voiceState === "speaking"
                      ? t("appointment.stateAsking")
                      : voice.voiceState === "thinking"
                        ? t("appointment.stateProcessing")
                        : voice.voiceState === "listening"
                          ? t("appointment.stateAnswer")
                          : t("status.availableNow")}
                  </span>
                </div>
                {/* The session's own localized error, surfaced INSIDE the
                    modal — the card-level alert is visually behind the
                    backdrop. Skip stays available either way, so a failed
                    voice start never traps the visitor. */}
                {voice.error && !qualComplete && (
                  <p className="text-xs text-rose-300" role="alert" data-testid="qual-voice-error">
                    {voice.error}
                  </p>
                )}
                {qualComplete && <p className="text-xs text-slate-400">{t("appointment.qualifyDone")}</p>}
                {qualComplete && (
                  <Button
                    variant="default"
                    data-testid="qualification-continue"
                    onClick={advanceToSlots}
                    className="w-full flex items-center justify-center gap-2 text-xs font-semibold ai-pulse-glow"
                  >
                    {t("appointment.qualifyContinue")} <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </Button>
                )}
              </div>
            )}

            {/* The escape hatch: nobody is ever trapped in the questionnaire.
                A visitor who skips still books; the lead simply carries no
                voice qualification. */}
            <button
              type="button"
              data-testid="skip-qualification"
              onClick={advanceToSlots}
              className="w-full text-center text-[11px] text-slate-400 hover:text-slate-200 underline underline-offset-2 focus:outline-none focus:ring-2 focus:ring-sky-500 rounded py-1"
            >
              {t("appointment.qualifySkip")}
            </button>
          </div>
        )}

        {/* Step 1: Slot Selection */}
        {step === 1 && (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-bold text-slate-100">{t("appointment.chooseSlotTitle")}</h3>
                <span className="inline-flex items-center gap-1 text-[10px] text-sky-400 bg-sky-500/10 border border-sky-500/20 rounded-full px-2 py-0.5 font-mono">
                  <Globe className="h-3 w-3" aria-hidden="true" />
                  {typeof window !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : "Local Time"}
                </span>
              </div>
              <p className="text-xs text-slate-400">{t("appointment.chooseSlotSubtitle", { employeeName, companyName })}</p>
            </div>

            {slotsLoading && (
              <div className="space-y-2 py-1" aria-busy="true" aria-label={t("appointment.loadingSlots")}>
                <Skeleton className="h-11 w-full rounded-xl" />
                <Skeleton className="h-11 w-full rounded-xl" />
                <Skeleton className="h-11 w-full rounded-xl" />
                <Skeleton className="h-11 w-full rounded-xl" />
              </div>
            )}

            {!slotsLoading && (slotsReason === "error" || slotsReason === "rate_limited") && (
              <div role="alert" className="flex items-start gap-2 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-200 text-xs">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
                <span>
                  {slotsReason === "rate_limited" ? t("appointment.errorRateLimited") : t("appointment.errorSlotsGeneric")}{" "}
                  {externalBookingUrl ? t("appointment.errorSlotsHintWithLink") : t("appointment.errorSlotsHintNoLink")}
                </span>
              </div>
            )}

            {!slotsLoading && slotsReason === "unconfigured" && (
              <div className="p-3 rounded-xl bg-white/[0.04] border border-white/[0.08] text-xs text-slate-400">
                {t("appointment.unconfiguredNotice", { employeeName })}{" "}
                {externalBookingUrl ? t("appointment.unconfiguredHintWithLink") : ""}
                {t("appointment.unconfiguredHintNoLink")}
              </div>
            )}

            {!slotsLoading && slots.length > 0 && (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {slots.map((slot) => (
                  <button
                    key={slot.time}
                    type="button"
                    onClick={() => setSelectedSlot(slot.time)}
                    aria-pressed={selectedSlot === slot.time}
                    className={`w-full flex items-center justify-between p-3 rounded-xl border text-xs font-medium transition-all ${
                      selectedSlot === slot.time
                        ? "bg-sky-500/10 border-sky-500/40 text-sky-300 shadow-md shadow-sky-500/10"
                        : "bg-white/[0.04] border-white/[0.08] text-slate-300 hover:border-white/20"
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <Clock className="h-4 w-4 text-sky-400" aria-hidden="true" />
                      {formatSlot(slot.time)}
                    </span>
                    {selectedSlot === slot.time && <CheckCircle2 className="h-4 w-4 text-sky-400" aria-hidden="true" />}
                  </button>
                ))}
              </div>
            )}

            <div className="flex items-center justify-between pt-4 border-t border-white/[0.08]">
              {externalBookingUrl ? (
                <a href={externalBookingUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-sky-400 hover:underline">
                  {t("appointment.openCalendarLink")} &rarr;
                </a>
              ) : (
                <div />
              )}
              <Button variant="default" onClick={() => setStep(2)} disabled={!selectedSlot} className="flex items-center gap-2 text-xs">
                {t("appointment.nextStep")} <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
          </div>
        )}

        {/* Step 2: Contact Form */}
        {step === 2 && (
          <form onSubmit={handleBook} className="space-y-4">
            <div className="space-y-1">
              <h3 className="text-sm font-bold text-slate-100">{t("appointment.enterDetailsTitle")}</h3>
              <p className="text-xs text-slate-400">
                {t("appointment.slotSelectedLabel")} <span className="text-sky-400 font-semibold">{selectedSlot ? formatSlot(selectedSlot) : "—"}</span>
              </p>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs text-slate-400 font-medium" htmlFor="appt-name">{t("appointment.fullNameLabel")}</label>
                <div className="relative mt-1">
                  <User className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" aria-hidden="true" />
                  <input
                    id="appt-name"
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder={t("appointment.fullNamePlaceholder")}
                    className="dashboard-input !pl-9 w-full"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs text-slate-400 font-medium" htmlFor="appt-email">{t("appointment.emailLabel")}</label>
                <div className="relative mt-1">
                  <Mail className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" aria-hidden="true" />
                  <input
                    id="appt-email"
                    type="email"
                    required
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder={t("appointment.emailPlaceholder")}
                    className="dashboard-input !pl-9 w-full"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs text-slate-400 font-medium" htmlFor="appt-phone">{t("appointment.phoneLabel")}</label>
                <div className="relative mt-1">
                  <Phone className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" aria-hidden="true" />
                  <input
                    id="appt-phone"
                    type="tel"
                    required
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    placeholder={t("appointment.phonePlaceholder")}
                    className="dashboard-input !pl-9 w-full"
                  />
                </div>
              </div>
            </div>

            {submitErrorKey && (
              <div role="alert" className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-200 text-xs">
                {t(submitErrorKey)}
              </div>
            )}

            <div className="flex items-center justify-between pt-4 border-t border-white/[0.08]">
              <Button type="button" variant="outline" onClick={() => setStep(1)} className="text-xs">
                {t("appointment.back")}
              </Button>
              <Button type="submit" disabled={submitting} className="flex items-center gap-2 text-xs">
                {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : null}
                {submitting ? t("appointment.booking") : t("appointment.confirmBooking")}
              </Button>
            </div>
          </form>
        )}

        {/* Step 3: Real outcome — confirmed or requested, never both framed as "confirmed" */}
        {step === 3 && outcome && (
          <div className="text-center py-6 space-y-4">
            <div
              className={`mx-auto h-16 w-16 rounded-full border flex items-center justify-center ${
                outcome.confirmed
                  ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-400 animate-bounce"
                  : "bg-sky-500/20 border-sky-500/40 text-sky-400"
              }`}
            >
              <CheckCircle2 className="h-8 w-8" aria-hidden="true" />
            </div>
            <div className="space-y-1">
              <h3 className="text-lg font-bold text-slate-100">
                {outcome.confirmed ? t("appointment.confirmedTitle") : t("appointment.requestedTitle")}
              </h3>
              <p className="text-xs text-slate-300">
                {outcome.confirmed ? t("appointment.confirmedMessage") : t("appointment.requestedMessage")}
              </p>
              {selectedSlot && (
                <p className="text-[11px] text-slate-400 pt-1">
                  {t("appointment.preferredTimeLabel")} <span className="text-slate-200">{formatSlot(selectedSlot)}</span>
                </p>
              )}
            </div>
            <Button variant="outline" onClick={handleReset} className="text-xs mt-4">
              {t("appointment.done")}
            </Button>
          </div>
        )}
      </div>
    </Dialog>
  );
};
