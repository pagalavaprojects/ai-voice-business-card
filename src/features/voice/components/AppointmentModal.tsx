"use client";

import React, { useEffect, useRef, useState } from "react";
import { Clock, User, Mail, Phone, CheckCircle2, ArrowRight, Loader2, AlertTriangle, Globe } from "lucide-react";
import { Dialog } from "@/shared/ui/dialog";
import { Button } from "@/shared/ui/button";
import { Skeleton } from "@/shared/ui/skeleton";
import type { LanguageCode } from "@/features/language/config";
import {
  buildAppointmentConfirmedSpeech,
  getActiveQualificationQuestion,
  getAuthoredQuestion,
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
  /** When true, "Book an Appointment" opens on the six-data-point
   * qualification step BEFORE slot selection. The step is TEXT/BUTTON ONLY —
   * the visitor taps Yes/No/Maybe (ஆம்/இல்லை/இருந்தாலும் in Tamil); there is
   * NO voice, NO microphone, NO Vapi, NO TTS and NO audio at any point in
   * qualification. Each tap is classified and persisted by the same
   * server-authoritative sequencing endpoint the voice flow uses (POST
   * qualification-status), keyed by an unguessable per-open session id, so the
   * recorded funnel is identical to a voice qualification. The visitor is
   * never trapped: a skip control is always available. Absent/false (older
   * callers/tests), the modal opens directly on slot selection as before. */
  qualifyFirst?: boolean;
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
  qualifyFirst,
}) => {
  // Step 0 (voiceless data-point qualification) exists only when the caller
  // asked for it; otherwise the flow starts on slot selection as it always did.
  const [step, setStep] = useState<0 | 1 | 2 | 3>(qualifyFirst ? 0 : 1);
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
  /**
   * The question number a quick reply has already been tapped for, and the
   * label that was tapped.
   *
   * Keyed by question number rather than a plain boolean because the answer
   * takes a moment to come back through the server: without it a second tap
   * — or an impatient double tap — would send the answer twice and could
   * advance two questions. The record is compared against the question
   * currently on screen, so the buttons come back by themselves for the next
   * question and can never re-answer a question already recorded.
   */
  const [quickReply, setQuickReply] = useState<{ questionNumber: number; label: string } | null>(null);
  /** An answer submission (POST qualification-status) failed — the tap is
   * released so the visitor can retry; the current data point stays on screen
   * with a short, honest error (never a "please wait" filler). */
  const [qualError, setQualError] = useState(false);
  /**
   * The same claim, held in a ref so it is true IMMEDIATELY.
   *
   * The state above cannot stop a fast double tap: two clicks dispatched
   * before React re-renders both read the same stale `quickReply` from their
   * render's closure, so both pass the guard and the answer goes twice —
   * which can advance two questions. A ref is written synchronously, so the
   * second click in the same batch sees the first one's claim.
   */
  const quickReplyLockRef = useRef<number | null>(null);
  // The unguessable session id for THIS booking's qualification — the
  // text-flow analogue of a voice call's callId. Created lazily when the
  // visitor begins qualification and reset on close, so a fresh open starts a
  // clean session. Kept in a ref (never triggers a render) and read
  // synchronously by the answer submitter and its in-flight guard.
  const qualSessionRef = useRef<string | null>(null);
  // Bumped on begin/close so a POST that resolves after the visitor moved on
  // (skipped, closed, restarted) can recognize itself as stale and not write
  // its result onto the new session's state.
  const qualRunRef = useRef(0);
  const [slots, setSlots] = useState<CalcomSlot[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  // Distinguishes WHY the slot list is empty — "unconfigured" (this company
  // genuinely has no online booking set up) reads very differently to a
  // visitor than "error" (a transient Cal.com outage, try again shortly).
  // Conflating the two previously meant a real outage got misreported as
  // "this company doesn't support online booking," which isn't true.
  const [slotsReason, setSlotsReason] = useState<"unconfigured" | "error" | "rate_limited" | "empty" | null>(null);
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
        // Distinguish a genuine provider/config failure (the route sends an
        // explicit `reason`) from a SUCCESSFUL response that simply has no
        // availability (no `reason`). Defaulting an empty-but-successful
        // response to "error" would tell the visitor "we couldn't load times"
        // when Cal.com actually answered with zero open slots.
        setSlotsReason(list.length === 0 ? data.reason ?? "empty" : null);
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

  // Begins the six-data-point qualification: mints a fresh, unguessable
  // session id (the text-flow analogue of a voice callId) and reveals the
  // first data point. No microphone, no Vapi, no audio — nothing is
  // initialized here beyond a random id and a state flip.
  const beginQualification = () => {
    qualRunRef.current++;
    qualSessionRef.current =
      typeof crypto !== "undefined" && crypto.randomUUID ? `web-${crypto.randomUUID()}` : `web-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setQualAnswers([]);
    setQualComplete(false);
    setQuickReply(null);
    quickReplyLockRef.current = null;
    setQualError(false);
    setQualStage("active");
  };

  // Submits ONE tapped answer to the server-authoritative sequencing endpoint
  // (POST qualification-status) — the SAME classification + persistence the
  // voice flow used, minus the voice. The response carries the authoritative
  // answers array, so the display advances directly from server truth (no
  // polling). Forward-only and duplicate-safe: the double-tap claim below
  // guards the client, and the tool no-ops an already-recorded data point on
  // the server. A stale response (visitor skipped/closed/restarted meanwhile)
  // is discarded via the run token.
  const submitAnswer = (questionNumber: number, label: string) => {
    // A data point already answered (or its answer in flight) must never be
    // answered again — the ref is set synchronously so a double tap in the
    // same batch is already too late.
    if (quickReplyLockRef.current === questionNumber || quickReply?.questionNumber === questionNumber) return;
    const sessionId = qualSessionRef.current;
    if (!sessionId) return;
    quickReplyLockRef.current = questionNumber;
    setQuickReply({ questionNumber, label });
    setQualError(false);
    const run = qualRunRef.current;
    fetch(`/api/public/${companyId}/${employeeId}/qualification-status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, questionNumber, answer: label, language }),
    })
      .then((res) => (res.ok ? (res.json() as Promise<{ qualified?: boolean; answers?: Array<{ n: number; c: string; a: string }> }>) : Promise.reject(new Error(`status ${res.status}`))))
      .then((data) => {
        if (qualRunRef.current !== run) return; // superseded — ignore
        if (Array.isArray(data?.answers)) setQualAnswers(data.answers);
        if (data?.qualified) setQualComplete(true);
        // Release the claim: the next data point (a different number) renders
        // its own fresh answer row. If the server somehow did NOT record this
        // answer (network hiccup mid-write), the claim clears so the visitor
        // can tap again rather than facing a dead row.
        quickReplyLockRef.current = null;
        setQuickReply(null);
      })
      .catch(() => {
        if (qualRunRef.current !== run) return;
        quickReplyLockRef.current = null;
        setQuickReply(null);
        setQualError(true);
      });
  };

  const advanceToSlots = () => {
    // Leaving qualification behind — invalidate any answer POST still in
    // flight so a late response cannot repopulate a step the visitor has
    // already moved past.
    qualRunRef.current++;
    setStep(1);
  };

  const handleReset = () => {
    // Invalidates any qualification answer POST and any booking POST still in
    // flight (see bookingSessionRef).
    qualRunRef.current++;
    qualSessionRef.current = null;
    bookingSessionRef.current++;
    spokenConfirmationRef.current = false;
    setStep(qualifyFirst ? 0 : 1);
    setQualStage("intro");
    setQualComplete(false);
    setQualAnswers([]);
    // The modal is reused, never unmounted — a leftover pending-answer claim
    // from the session just closed must not survive into the next one, or the
    // first data point of a fresh qualification could render already
    // "answered" (its options swapped for a processing spinner that never
    // resolves).
    setQuickReply(null);
    quickReplyLockRef.current = null;
    setQualError(false);
    setFormData({ name: "", email: "", phone: "" });
    setOutcome(null);
    setSubmitErrorKey(null);
    onClose();
  };

  return (
    <Dialog open={open} onClose={handleReset} title={t("appointment.title")} size="md" closeLabel={t("buttons.close")}>
      <div className="space-y-6">
        {/* Progress Bar — the Data Points step appears only when the caller
            asked for qualification-first. */}
        <div className="flex items-center justify-between border-b border-white/[0.08] pb-4 overflow-x-auto">
          {(qualifyFirst
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

        {/* Step 0: Data-point qualification — TEXT/BUTTON ONLY. No voice, no
            microphone, no Vapi, no TTS. The visitor taps Yes/No/Maybe
            (ஆம்/இல்லை/இருந்தாலும் in Tamil) for six data points; each tap is
            classified and persisted server-side (POST qualification-status),
            and the display advances from that authoritative response. */}
        {step === 0 && qualifyFirst && (
          <div className="space-y-4">
            {qualStage === "intro" && (
              <div className="space-y-3">
                <p className="text-xs text-slate-400 text-center leading-relaxed">{t("appointment.qualifyInProgress")}</p>
                <Button
                  variant="default"
                  data-testid="start-qualification"
                  onClick={beginQualification}
                  className="w-full flex items-center justify-center gap-2 text-xs font-semibold min-h-[44px]"
                >
                  {t("appointment.qualifyStart")} <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Button>
              </div>
            )}

            {qualStage === "active" && (
              <div className="p-4 rounded-xl bg-white/[0.04] border border-white/[0.08] space-y-3">
                {(() => {
                  // The qualification language follows the selected card
                  // language (en/ta authored sets; anything else English) —
                  // the SAME mapping the server's sequencing tool uses.
                  const qualLang = toQualificationLanguage(language);
                  // ONE source of truth: the active data point is decided by
                  // the SERVER's recorded-answer count, never by client state,
                  // so the number can never jump ahead of what was actually
                  // answered, skip, or fall back. The count only grows (a
                  // stale answer POST is dropped by the run-token guard above),
                  // so this moves strictly forward.
                  const answeredCount = qualAnswers.reduce((m, a) => Math.max(m, a.n), 0);
                  const active = getActiveQualificationQuestion({ language: qualLang, answeredCount, complete: qualComplete });
                  const qNum = active.number;
                  const dpLine = active.text;
                  return (
                    <div className="space-y-2.5" data-testid="qualification-conversation">
                      {qNum > 0 && (
                        <p className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold" data-testid="qual-progress">
                          {t("appointment.qualifyProgress", { n: String(qNum), total: String(active.total) })}
                        </p>
                      )}
                      {/* Answered data points: the authored text + its
                          YES/NO/MAYBE tag, exactly as the server recorded them
                          — never reconstructed or invented client-side. */}
                      {qualAnswers.length > 0 && (
                        <div className="space-y-2 max-h-36 overflow-y-auto pr-1" data-testid="qual-history">
                          {qualAnswers.map((ans) => {
                            const authored = getAuthoredQuestion(ans.n, qualLang);
                            const accentBorder =
                              ans.c === "YES" ? "border-emerald-400/40" : ans.c === "NO" ? "border-rose-400/40" : "border-amber-400/40";
                            return (
                              <div key={ans.n} className={`border-l-2 ${accentBorder} pl-2.5`}>
                                {authored && (
                                  <p className="text-[11px] text-slate-400 leading-snug" lang={qualLang}>
                                    {authored.question}
                                  </p>
                                )}
                                <p className="text-[11px] text-slate-200 leading-snug mt-0.5" data-testid={`answer-${ans.n}`}>
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
                      )}
                      {/* The current data point, in the authoritative authored
                          wording (never a paraphrase). */}
                      {dpLine && (
                        <p className="text-sm text-slate-100 leading-relaxed pt-1" data-testid="current-question" lang={qualLang}>
                          {dpLine}
                        </p>
                      )}
                      {/* Once THIS data point's answer is in flight, its options
                          give way to a processing indicator that belongs to the
                          same data point — so the screen never shows a question
                          beside a locked, greyed row. When the server advances,
                          qNum changes, the pending claim no longer matches, and
                          the next data point renders a fresh row: the swap is
                          atomic, data point and options always agree. */}
                      {qNum > 0 && !qualComplete && quickReply?.questionNumber === qNum && (
                        <div className="flex items-center gap-2 pt-1" data-testid="quick-reply-processing" aria-live="polite">
                          <Loader2 className="h-3.5 w-3.5 animate-spin text-sky-400" aria-hidden="true" />
                          <span className="text-xs font-medium text-slate-300">{t("appointment.stateProcessing")}</span>
                        </div>
                      )}
                      {/* Tap Yes / No / Maybe. The label IS the answer word the
                          server classifies — one answer path. Offered only
                          while a data point is on screen and unanswered, and
                          never once this data point's answer is in flight. */}
                      {qNum > 0 && !qualComplete && quickReply?.questionNumber !== qNum && (
                        <div
                          className="flex flex-wrap gap-2 pt-1"
                          role="group"
                          aria-label={t("appointment.quickReplyLabel")}
                          data-testid="quick-replies"
                        >
                          {active.options.map((option) => (
                            <button
                              key={option.classification}
                              type="button"
                              lang={qualLang}
                              aria-label={option.label}
                              data-testid={`quick-reply-${option.classification.toLowerCase()}`}
                              onClick={() => submitAnswer(qNum, option.label)}
                              className="min-h-[44px] flex-1 min-w-[88px] px-3 rounded-xl border text-xs font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 bg-white/[0.04] border-white/[0.10] text-slate-100 hover:bg-white/[0.08] hover:border-white/20 active:scale-[0.98]"
                            >
                              {option.label}
                            </button>
                          ))}
                        </div>
                      )}
                      {/* An answer POST failed — the tap is released so the
                          visitor can retry the same data point. Honest, brief,
                          never a "please wait" filler. */}
                      {qualError && !qualComplete && (
                        <p className="text-xs text-rose-300" role="alert" data-testid="qual-answer-error">
                          {t("appointment.qualifyAnswerError")}
                        </p>
                      )}
                    </div>
                  );
                })()}

                {qualComplete && <p className="text-xs text-slate-400">{t("appointment.qualifyDone")}</p>}
                {qualComplete && (
                  <Button
                    variant="default"
                    data-testid="qualification-continue"
                    onClick={advanceToSlots}
                    className="w-full flex items-center justify-center gap-2 text-xs font-semibold min-h-[44px] ai-pulse-glow"
                  >
                    {t("appointment.qualifyContinue")} <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </Button>
                )}
              </div>
            )}

            {/* The escape hatch: nobody is ever trapped. A visitor who skips
                still books; the lead simply carries no qualification. */}
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

            {/* Cal.com answered successfully but has no open slots — an honest
                "no availability" state, distinct from the provider-error one. */}
            {!slotsLoading && slotsReason === "empty" && (
              <div className="p-3 rounded-xl bg-white/[0.04] border border-white/[0.08] text-xs text-slate-400">
                {t("appointment.noSlots")}{" "}
                {externalBookingUrl ? t("appointment.errorSlotsHintWithLink") : t("appointment.errorSlotsHintNoLink")}
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
