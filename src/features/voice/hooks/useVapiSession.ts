"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import type Vapi from "@vapi-ai/web";
import { VoiceState } from "../components/VoiceMicButton";
import { MessageItem } from "../components/TranscriptViewer";
import { DEFAULT_VOICE_ID, OpenAIVoiceId } from "@/shared/lib/voice";
import { installVapiLoudnessEnhancement } from "../lib/audioEnhancement";

// Deliberately generic and tenant-neutral. This is a shared hook serving
// every company's card, so naming one specific founder/company here would
// make any OTHER tenant whose first_message failed to load introduce itself
// with the wrong identity. The real greeting always comes from the agent's
// first_message column via /api/public/[companyId]/[employeeId].
const DEFAULT_FIRST_MESSAGE = "Hello, thank you for scanning my business card. How can I help you today?";

// The SDK's own type for .start()'s first argument — used as a single
// boundary cast below. `tools` arrives here as untyped JSON (round-tripped
// through our own /api/public/... response, produced by ToolRegistry's
// already-OpenAI-function-call-shaped output), so it can't structurally
// match Vapi's specific tool DTO union without re-importing our backend's
// domain types into a client-side voice hook, which isn't worth doing
// for a shape Vapi's own API validates at runtime regardless.
type VapiStartParam = Parameters<InstanceType<typeof Vapi>["start"]>[0];
/** The assistant-object form of VapiStartParam (it's a string | object
 * union — the object member is what this hook always builds). */
type VapiAssistantParam = Exclude<VapiStartParam, string | undefined>;

/** Demo mode (no real Vapi key configured — local dev without credentials,
 * or this exact env in the test suite) simulates the call entirely client
 * side with no real WebRTC/mic involved. Extracted so both the initializing
 * effect and the caller (for deciding whether autoplay is even meaningful to
 * attempt) use the identical rule. */
function isDemoVapiKey(key: string | undefined): boolean {
  return !key || key === "demo-vapi-key" || key.includes("demo");
}

export interface UseVapiSessionOptions {
  companyId: string;
  employeeId: string;
  vapiPublicKey?: string;
  firstMessage?: string;
  systemPrompt?: string | null;
  tools?: unknown[];
  serverUrl?: string;
  voiceId?: OpenAIVoiceId | string;
  /** Resolved server-side by resolveVoiceProviderConfig — this hook never
   * re-derives provider choice itself, so a browser call and a phone call
   * (webhook route) can never disagree about which provider is active. */
  voiceProvider?: "openai" | "11labs";
  voiceModel?: string;
  /** Transcriber language code for the visitor's chosen conversation
   * language — resolved server-side by resolveTranscriberConfig, same
   * "the hook never re-derives provider choice" principle as voiceProvider
   * above. Omitted entirely when unset, which keeps Vapi's own default
   * (English) transcriber behavior for any caller that hasn't opted into
   * multilingual support. */
  speechLocale?: string;
  /** Which transcriber provider speechLocale belongs to. Defaults to
   * "deepgram" — the only provider used before multilingual support was
   * added, so an existing caller that only ever passed speechLocale keeps
   * behaving identically. */
  transcriberProvider?: "deepgram" | "azure";
  /** The full transcriber spec resolved server-side (provider + optional
   * model + language). Takes precedence over the legacy speechLocale/
   * transcriberProvider pair when present — needed because the OpenAI
   * transcriber (Tamil/Kannada) requires a `model` field the legacy pair
   * cannot express. */
  transcriber?: { provider: string; model?: string; language: string };
  /** Translator for this hook's own fallback strings (demo-mode greeting,
   * connection-error text) — resolved by the caller against the visitor's
   * chosen language, same t-as-prop convention as LanguageGate/
   * AppointmentModal/TranscriptViewer. Optional: a caller that omits it
   * (or renders before the language bundle has loaded) still gets the
   * English defaults below rather than a raw translation key or a crash. */
  t?: (key: string, vars?: Record<string, string>) => string;
}

export function useVapiSession({
  companyId,
  employeeId,
  vapiPublicKey,
  firstMessage,
  systemPrompt,
  tools,
  voiceId,
  voiceProvider,
  voiceModel,
  serverUrl,
  speechLocale,
  transcriberProvider = "deepgram",
  transcriber,
  t,
}: UseVapiSessionOptions) {
  const defaultFirstMessage = t ? t("mic.defaultFirstMessage") : DEFAULT_FIRST_MESSAGE;
  const connectionErrorText = t ? t("mic.connectionError") : "Voice connection error";
  const startCallErrorText = t ? t("mic.startCallError") : "Failed to start live voice call";
  // Kept fresh via a ref, not read directly: the "error" handler below is
  // registered once inside the Vapi-instance-init effect, whose dependency
  // array deliberately excludes these localized strings — recreating the
  // whole Vapi SDK instance on every language switch would be wasteful when
  // nothing about the connection itself needs to change.
  const connectionErrorTextRef = useRef(connectionErrorText);
  useEffect(() => {
    connectionErrorTextRef.current = connectionErrorText;
  }, [connectionErrorText]);

  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [isMuted, setIsMuted] = useState(false);
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [durationSeconds, setDurationSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [callId, setCallId] = useState<string | null>(null);
  // True only while the call's very first assistant utterance (the scripted
  // first_message) is being spoken — lets the UI say "Introducing…" instead
  // of the generic "Speaking" label for just that opening line, then never
  // again for the rest of the same call.
  const [isPlayingIntro, setIsPlayingIntro] = useState(false);

  // Computed at render time, not inside an effect: it's a pure function of
  // two already-known values, and the caller needs it synchronously to
  // decide whether attempting autoplay is even meaningful (see isDemoMode
  // in the return value below).
  const isDemoMode = isDemoVapiKey(vapiPublicKey || process.env.NEXT_PUBLIC_VAPI_PUBLIC_KEY);

  const vapiRef = useRef<Vapi | null>(null);
  // Resolves when the dynamically-imported SDK has been constructed (or
  // failed) — startCall awaits it so an early tap never mis-lands in the
  // demo path just because the chunk hadn't arrived yet.
  const sdkReadyRef = useRef<Promise<unknown> | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const isDemoModeRef = useRef<boolean>(isDemoMode);
  // Flips true the moment the first assistant utterance is seen, and stays
  // true for the rest of THIS call — reset on every fresh call-start, so a
  // page refresh or a new session correctly plays the intro again.
  const hasHadFirstAssistantSpeechRef = useRef<boolean>(false);
  // The approximated "assistant finished speaking" timer (see the `message`
  // handler below) — tracked so a call that ends, errors, or gets a newer
  // transcript before this fires can cancel it. Left unguarded, a stray
  // firing after call-end silently un-ends the call: it calls
  // setVoiceState("listening"), which flips isCallActive back to true and
  // reopens the Mute/End Call UI for a call that has already stopped.
  const speakingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  // The demo-mode simulated call's two chained timeouts (600ms, then a
  // further 2500ms) — tracked for the same reason: ending a demo call before
  // they fire must not let them resurrect it afterward.
  const demoTimeoutsRef = useRef<NodeJS.Timeout[]>([]);
  // Set by endCall() and checked in the call-start handler. Calling the SDK's
  // stop() while a call is still "connecting" is a no-op — its internal
  // `call` object doesn't exist yet, so there's nothing to destroy — meaning
  // the original start() can go on to actually connect after the visitor
  // already asked to end it. When that happens this flag tells call-start to
  // tear the now-real session down immediately instead of surfacing it.
  const userEndedCallRef = useRef(false);
  // True from the moment a live call connects until the intro's approximated
  // "finished speaking" timer fires. The mic is force-muted at the SDK level
  // for this whole window (see call-start below) so the visitor's speech is
  // never captured, transcribed, or able to interrupt the scripted opening —
  // a stronger guarantee than firstMessageInterruptionsEnabled alone, which
  // only stops Vapi from cutting the greeting short but doesn't stop the mic
  // from listening in the background.
  const introGateActiveRef = useRef(false);
  // Exactly one automatic reconnect per call lifecycle, reset whenever a
  // fresh call is (auto- or manually) started. Without a cap, a genuinely
  // dead connection would retry forever.
  const reconnectAttemptedRef = useRef(false);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  // startCall is redeclared every render (it closes over the card's fields),
  // so the error handler registered once inside the init effect below reads
  // its latest version through this ref rather than closing over a stale one.
  const startCallRef = useRef<() => void>(() => {});
  const mountedRef = useRef(true);
  // The overrides of the most recent explicit startCall — replayed by the
  // automatic reconnect so a dropped qualification call resumes as a
  // qualification call (opening = Q1, closed-ended systemPrompt), never as
  // a default greeting call. Both fields must travel together: a
  // qualification call that reconnected with Q1 but the GENERAL
  // systemPrompt would have the model asking Q1 without knowing it must
  // stay closed-ended and call the sequencing tool.
  const lastOverridesRef = useRef<{ firstMessage?: string; systemPrompt?: string } | undefined>(undefined);

  const clearReconnectTimeout = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
  }, []);

  const clearSpeakingTimeout = useCallback(() => {
    if (speakingTimeoutRef.current) {
      clearTimeout(speakingTimeoutRef.current);
      speakingTimeoutRef.current = null;
    }
  }, []);

  const clearDemoTimeouts = useCallback(() => {
    demoTimeoutsRef.current.forEach(clearTimeout);
    demoTimeoutsRef.current = [];
  }, []);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const startTimer = useCallback(() => {
    stopTimer();
    setDurationSeconds(0);
    timerRef.current = setInterval(() => {
      setDurationSeconds((prev) => prev + 1);
    }, 1000);
  }, [stopTimer]);

  // Initialize Vapi Instance or Demo Mode
  useEffect(() => {
    const publicKey = vapiPublicKey || process.env.NEXT_PUBLIC_VAPI_PUBLIC_KEY;
    isDemoModeRef.current = isDemoMode;

    // The second check is redundant with isDemoMode at runtime (a missing
    // key is exactly one of the conditions isDemoMode already covers) — it's
    // here only so TypeScript can narrow publicKey to `string` below, which
    // it can't do through the isDemoVapiKey() function call above.
    if (isDemoMode || !publicKey) {
      // Demo Voice Session Initialization (No external 401 WebRTC error)
      return () => {
        stopTimer();
      };
    }

    // The Vapi SDK (WebRTC + Daily) is deliberately NOT in the initial
    // bundle: the public card must render and play pitches without paying
    // for conversational-voice bytes up front. The SDK loads here in the
    // background right after mount; startCall awaits sdkReadyRef for the
    // sliver of time before it lands, so a fast tap still gets a real call.
    let disposed = false;
    let teardown: (() => void) | null = null;
    sdkReadyRef.current = import("@vapi-ai/web")
      .then(({ default: VapiCtor }) => {
        if (disposed) return;
        try {
      const vapi = new VapiCtor(publicKey);
      vapiRef.current = vapi;
      // Reroutes Vapi's own <audio> element(s) through a gain/compressor/
      // limiter chain — see audioEnhancement.ts. Independent of call
      // lifecycle (watches the DOM directly), so it's installed once here
      // rather than re-installed per call.
      const uninstallLoudnessEnhancement = installVapiLoudnessEnhancement();

      vapi.on("call-start", () => {
        // A call reaching call-start after the visitor already pressed End
        // (possible while it was still "connecting" — see userEndedCallRef's
        // declaration for why stop() couldn't cancel it earlier) must be torn
        // down immediately rather than surfaced as a live call they never
        // asked to rejoin. stop() now actually works: the SDK's internal
        // `call` object exists by the time call-start fires.
        if (userEndedCallRef.current) {
          try {
            vapi.stop();
          } catch (err) {
            console.warn("Vapi stop exception (post-end call-start):", err);
          }
          return;
        }
        // Force the mic off at the SDK level for the whole scripted opening —
        // this, not just firstMessageInterruptionsEnabled below, is what
        // actually satisfies "no accidental microphone activation, no
        // speech recognition during intro": a muted local track sends no
        // audio for Vapi's ASR to act on in the first place. This is the
        // earliest point `this.call` reliably exists (confirmed against the
        // SDK source — the same reason the userEndedCallRef guard above
        // works), so it's the earliest point setMuted can actually take
        // effect; the alternative, Daily's own `startAudioOff` factory
        // option, is accepted by this SDK version's types but never actually
        // forwarded to Daily's call object — verified dead, not used.
        introGateActiveRef.current = true;
        try {
          vapi.setMuted(true);
        } catch (err) {
          console.warn("Vapi setMuted(true) exception at call-start:", err);
        }
        setVoiceState("listening");
        setError(null);
        startTimer();
        // Fresh call: the intro has not played yet in this session.
        hasHadFirstAssistantSpeechRef.current = false;
        setIsPlayingIntro(false);
        // A call that reaches call-start has genuinely connected — this,
        // not startCall() being merely invoked, is what earns a fresh
        // reconnect budget. Resetting it in startCall() instead would let a
        // reconnect attempt that itself fails immediately re-arm its own
        // retry, looping forever on a persistently bad connection.
        reconnectAttemptedRef.current = false;
      });

      vapi.on("call-end", () => {
        introGateActiveRef.current = false;
        setVoiceState("idle");
        setIsPlayingIntro(false);
        clearSpeakingTimeout();
        clearReconnectTimeout();
        stopTimer();
      });

      vapi.on("speech-start", () => {
        // During the scripted opening this should never fire from the
        // visitor at all — the mic is force-muted above — but if it
        // somehow does (a race, or a future SDK change), the correct
        // behavior per the no-barge-in requirement is to ignore it
        // entirely, not treat it as an interruption.
        if (introGateActiveRef.current) return;
        setVoiceState("listening");
      });

      vapi.on("speech-end", () => {
        if (introGateActiveRef.current) return;
        setVoiceState("thinking");
      });

      vapi.on("message", (message: { type: string; transcriptType?: string; role?: string; transcript?: string }) => {
        if (message.type === "transcript" && message.transcriptType === "final" && message.transcript) {
          const role = message.role === "user" ? "user" : "assistant";
          setMessages((prev) => [...prev, { role, content: message.transcript as string }]);
          if (role === "assistant") {
            const isIntro = !hasHadFirstAssistantSpeechRef.current;
            hasHadFirstAssistantSpeechRef.current = true;

            setVoiceState("speaking");
            if (isIntro) setIsPlayingIntro(true);
            // Vapi's SDK has no explicit "assistant finished speaking" event
            // to hook — this fixed window is the same approximation the
            // "speaking" -> "listening" transition above it already used
            // before the intro tracking was added. Cancel any timer already
            // pending from an earlier chunk of the same reply first — a
            // multi-sentence answer emits several final-transcript messages
            // in quick succession, and without this the FIRST chunk's timer
            // would flip the UI back to "listening" while the assistant is
            // still speaking the second sentence.
            clearSpeakingTimeout();
            speakingTimeoutRef.current = setTimeout(() => {
              speakingTimeoutRef.current = null;
              setVoiceState("listening");
              if (isIntro) {
                setIsPlayingIntro(false);
                // The scripted opening has finished — open the mic and let
                // the visitor speak. This is the one and only point the
                // intro's mic suppression is lifted.
                introGateActiveRef.current = false;
                try {
                  vapi.setMuted(false);
                } catch (err) {
                  console.warn("Vapi setMuted(false) exception at intro-end:", err);
                }
              }
            }, 3000);
          }
        }
      });

      vapi.on("error", (e: Error) => {
        console.error("Vapi WebRTC Error:", e);
        setError(e.message || connectionErrorTextRef.current);
        introGateActiveRef.current = false;
        setVoiceState("idle");
        clearSpeakingTimeout();
        stopTimer();

        // One bounded automatic reconnect for a call that dropped
        // unexpectedly — not for a call the visitor deliberately ended
        // (userEndedCallRef), and never more than once per call lifecycle
        // (reconnectAttemptedRef, reset in startCall). A component that has
        // since unmounted must not reconnect into a session nothing is
        // listening to.
        if (!userEndedCallRef.current && !reconnectAttemptedRef.current && mountedRef.current) {
          reconnectAttemptedRef.current = true;
          clearReconnectTimeout();
          reconnectTimeoutRef.current = setTimeout(() => {
            reconnectTimeoutRef.current = null;
            if (mountedRef.current && !userEndedCallRef.current) startCallRef.current();
          }, 1500);
        }
      });

      teardown = () => {
        vapi.stop();
        uninstallLoudnessEnhancement();
      };
        } catch (err: unknown) {
          console.warn("Vapi SDK setup warning:", err);
          isDemoModeRef.current = true;
        }
      })
      .catch((err: unknown) => {
        console.warn("Vapi SDK load failed — falling back to demo mode:", err);
        isDemoModeRef.current = true;
      });

    return () => {
      disposed = true;
      teardown?.();
      clearSpeakingTimeout();
      clearDemoTimeouts();
      clearReconnectTimeout();
      stopTimer();
    };
  }, [vapiPublicKey, isDemoMode, startTimer, stopTimer, clearSpeakingTimeout, clearDemoTimeouts, clearReconnectTimeout]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const startCall = useCallback(async (overrides?: { firstMessage?: string; systemPrompt?: string }) => {
    // Only one active session at a time — guards against a double-invoke
    // (a rapid double-tap, or the auto-start effect racing a manual tap
    // before its own guard ref has committed).
    if (voiceState !== "idle") return;
    // Remember the caller's overrides so an automatic reconnect restarts the
    // SAME kind of call. Without this, a qualification call (opening = Q1,
    // closed-ended systemPrompt) that drops on a transient WebRTC error
    // reconnects as a default card call — replaying the founder greeting
    // AND losing the closed-ended questionnaire instructions.
    lastOverridesRef.current = overrides;
    // Per-call opening line: the booking flow's qualification call speaks
    // the authored qualification intro instead of the card greeting; a plain
    // mic tap keeps the normal greeting.
    const effectiveFirstMessage = overrides?.firstMessage || firstMessage;
    // Per-call system prompt: the qualification call's caller passes the
    // base prompt PLUS the closed-ended questionnaire directive appended —
    // scoped to only this call so a general "Talk with AI" mic tap never
    // sees "this is a strict closed-ended questionnaire" mid-conversation.
    const effectiveSystemPrompt = overrides?.systemPrompt ?? systemPrompt;

    setError(null);

    // If the SDK chunk is still in flight (dynamic import above), wait for
    // it instead of misclassifying a real-keyed session as demo mode.
    if (!isDemoModeRef.current && !vapiRef.current && sdkReadyRef.current) {
      setVoiceState("connecting");
      await sdkReadyRef.current.catch(() => undefined);
      if (!vapiRef.current) setVoiceState("idle");
    }

    // If using Demo Mode (Local Testing without live Vapi keys)
    if (isDemoModeRef.current || !vapiRef.current) {
      setVoiceState("connecting");
      startTimer();
      hasHadFirstAssistantSpeechRef.current = false;
      // A prior demo call's own chained timers must not go on to fire into
      // this fresh one (or after endCall) — see clearDemoTimeouts' declaration.
      clearDemoTimeouts();

      const introTimeout = setTimeout(() => {
        setVoiceState("speaking");
        setIsPlayingIntro(true);
        hasHadFirstAssistantSpeechRef.current = true;
        setMessages([
          {
            role: "assistant",
            content: effectiveFirstMessage || defaultFirstMessage,
          },
        ]);
        const listeningTimeout = setTimeout(() => {
          setVoiceState("listening");
          setIsPlayingIntro(false);
        }, 2500);
        demoTimeoutsRef.current.push(listeningTimeout);
      }, 600);
      demoTimeoutsRef.current.push(introTimeout);

      return;
    }

    // Live WebRTC Voice Call with Vapi SDK
    // A previous call this visitor ended while it was still "connecting"
    // must not veto this new attempt — see userEndedCallRef's declaration.
    userEndedCallRef.current = false;
    try {
      setVoiceState("connecting");

      const assistantConfig = {
        firstMessage: effectiveFirstMessage || defaultFirstMessage,
        // Explicitly false (Vapi's own default): the scripted opening must
        // play to completion, uninterrupted, like a professional
        // receptionist's fixed announcement — a deliberate reversal of an
        // earlier version of this feature that let a visitor talk over the
        // greeting. The mic is also force-muted client-side for the same
        // window (see call-start in the init effect above) as the stronger,
        // primary guarantee; this flag is the backstop in case any audio
        // still reaches Vapi despite that.
        firstMessageInterruptionsEnabled: false,
        model: {
          provider: "openai",
          model: "gpt-4o-mini",
          // Without these, every live call ran a bare model with no
          // knowledge of the company/employee it's representing and no
          // ability to save leads or book meetings — the whole assembled
          // prompt + tool registry built server-side never reached a
          // real call, since inline assistant config from the browser
          // is all Vapi's client SDK ever sends unless told otherwise.
          ...(effectiveSystemPrompt ? { messages: [{ role: "system" as const, content: effectiveSystemPrompt }] } : {}),
          ...(tools && tools.length > 0 ? { tools } : {}),
        },
        // The Vapi Web SDK has no output-volume/gain control at all — its
        // only mic-side lever is increaseMicLevel(), which adjusts what the
        // visitor's microphone sends, not what the assistant is heard at.
        // Playback loudness is the listener's own device volume (verified
        // against the SDK's own type definitions, not assumed).
        //
        // voiceProvider === "11labs" is a platform-wide opt-in (see
        // resolveVoiceProviderConfig) for a real Tamil-tuned voice; unset,
        // this is exactly the prior OpenAI tts-1-hd behavior.
        voice:
          voiceProvider === "11labs" && voiceId
            ? { provider: "11labs" as const, voiceId, model: (voiceModel || "eleven_multilingual_v2") as "eleven_multilingual_v2" }
            : { provider: "openai" as const, voiceId: voiceId || DEFAULT_VOICE_ID, model: "tts-1-hd" as const },
        // Switches speech recognition to the visitor's chosen conversation
        // language. The full spec (provider + model + language) is resolved
        // server-side (resolveTranscriberConfig) and passed down whole via
        // `transcriber` — this hook doesn't re-derive provider choice. The
        // SDK's type unions proved untrustworthy here (they accept
        // deepgram+ta, which Vapi's server rejects with a 400 because
        // Deepgram's nova-2 supports fewer languages than the union
        // claims), so the mapping is validated per-account instead — see
        // features/language/config.ts. The legacy speechLocale/
        // transcriberProvider pair is kept for existing callers; omitted
        // entirely when neither is set, keeping Vapi's own default
        // transcriber behavior.
        ...(transcriber
          ? { transcriber: transcriber as VapiAssistantParam["transcriber"] }
          : speechLocale
            ? { transcriber: { provider: transcriberProvider, language: speechLocale } as const }
            : {}),
        // Routes tool-calls and the end-of-call report back to our
        // webhook for this specific company/employee during the call.
        ...(serverUrl ? { server: { url: serverUrl } } : {}),
      } as VapiStartParam;

      const call = await vapiRef.current.start(assistantConfig);
      // The Vapi call id is what links this browser session to the
      // server-side conversation/lead the webhook writes (conversations.
      // vapi_call_id -> leads.conversation_id) — it's how the booking
      // flow's qualification step can poll for the lead's temperature.
      setCallId((call as { id?: string } | null)?.id ?? null);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : startCallErrorText;
      setError(errorMessage);
      introGateActiveRef.current = false;
      setVoiceState("idle");
      stopTimer();
    }
  }, [voiceState, startTimer, stopTimer, firstMessage, systemPrompt, tools, serverUrl, voiceId, voiceProvider, voiceModel, speechLocale, transcriberProvider, transcriber, clearDemoTimeouts, defaultFirstMessage, startCallErrorText]);

  // Always call the latest startCall from the stable error handler
  // registered once inside the init effect (see reconnect logic above).
  useEffect(() => {
    startCallRef.current = () => {
      // Reconnects replay the last explicit call's overrides — a dropped
      // qualification call must reopen with Q1, not the default greeting.
      void startCall(lastOverridesRef.current);
    };
  }, [startCall]);

  const endCall = useCallback(() => {
    // Marks this session as user-ended so a call still "connecting" (whose
    // stop() below is a no-op — see userEndedCallRef's declaration) is torn
    // down the moment it actually reaches call-start instead of resuming.
    // Also cancels any pending automatic reconnect — a deliberate hang-up
    // must never be silently redialed.
    userEndedCallRef.current = true;
    reconnectAttemptedRef.current = true;
    clearReconnectTimeout();
    introGateActiveRef.current = false;
    clearDemoTimeouts();
    clearSpeakingTimeout();
    if (vapiRef.current && !isDemoModeRef.current) {
      try {
        vapiRef.current.stop();
      } catch (err) {
        console.warn("Vapi stop exception:", err);
      }
    }
    setVoiceState("idle");
    setIsPlayingIntro(false);
    stopTimer();
  }, [stopTimer, clearDemoTimeouts, clearSpeakingTimeout, clearReconnectTimeout]);

  const toggleMute = useCallback(() => {
    // The mic is force-muted for the scripted opening (see call-start
    // above); a manual toggle during that window would fight it and leave
    // isMuted out of sync with the SDK's actual state, so it's ignored
    // rather than allowed to race. The UI hides the mute control during the
    // intro for the same reason.
    if (introGateActiveRef.current) return;
    setIsMuted((prev) => {
      const nextMute = !prev;
      if (vapiRef.current && !isDemoModeRef.current) {
        try {
          vapiRef.current.setMuted(nextMute);
        } catch (err) {
          console.warn("Vapi mute exception:", err);
        }
      }
      return nextMute;
    });
  }, []);

  return {
    voiceState,
    isMuted,
    messages,
    durationSeconds,
    error,
    isPlayingIntro,
    isDemoMode,
    callId,
    startCall,
    endCall,
    toggleMute,
  };
}
