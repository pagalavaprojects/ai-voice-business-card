"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Vapi from "@vapi-ai/web";
import { VoiceState } from "../components/VoiceMicButton";
import { MessageItem } from "../components/TranscriptViewer";
import { DEFAULT_VOICE_ID, OpenAIVoiceId } from "@/shared/lib/voice";

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
}: UseVapiSessionOptions) {
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [isMuted, setIsMuted] = useState(false);
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [durationSeconds, setDurationSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
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

    try {
      const vapi = new Vapi(publicKey);
      vapiRef.current = vapi;

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
        setVoiceState("listening");
        setError(null);
        startTimer();
        // Fresh call: the intro has not played yet in this session.
        hasHadFirstAssistantSpeechRef.current = false;
        setIsPlayingIntro(false);
      });

      vapi.on("call-end", () => {
        setVoiceState("idle");
        setIsPlayingIntro(false);
        clearSpeakingTimeout();
        stopTimer();
      });

      vapi.on("speech-start", () => {
        setVoiceState("listening");
        // A visitor talking over the greeting is exactly the "user
        // interrupted" case — firstMessageInterruptionsEnabled (below) makes
        // Vapi itself stop the greeting's audio; this makes sure the UI's
        // "Introducing…" label drops the instant that happens, rather than
        // lingering until the 3s timer below would otherwise have cleared it.
        // The pending speaking->listening timer is now stale too — the
        // visitor's own speech already moved the state on.
        setIsPlayingIntro(false);
        clearSpeakingTimeout();
      });

      vapi.on("speech-end", () => {
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
              if (isIntro) setIsPlayingIntro(false);
            }, 3000);
          }
        }
      });

      vapi.on("error", (e: Error) => {
        console.error("Vapi WebRTC Error:", e);
        setError(e.message || "Voice connection error");
        setVoiceState("idle");
        clearSpeakingTimeout();
        stopTimer();
      });

      return () => {
        vapi.stop();
        clearSpeakingTimeout();
        clearDemoTimeouts();
        stopTimer();
      };
    } catch (err: unknown) {
      console.warn("Vapi SDK setup warning:", err);
      isDemoModeRef.current = true;
    }
  }, [vapiPublicKey, isDemoMode, startTimer, stopTimer, clearSpeakingTimeout, clearDemoTimeouts]);

  const startCall = useCallback(async () => {
    setError(null);

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
            content: firstMessage || DEFAULT_FIRST_MESSAGE,
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
        firstMessage: firstMessage || DEFAULT_FIRST_MESSAGE,
        // Default is false: without this, a visitor talking over the
        // scripted opening would have their speech ignored until the
        // greeting finished playing in full.
        firstMessageInterruptionsEnabled: true,
        model: {
          provider: "openai",
          model: "gpt-4o-mini",
          // Without these, every live call ran a bare model with no
          // knowledge of the company/employee it's representing and no
          // ability to save leads or book meetings — the whole assembled
          // prompt + tool registry built server-side never reached a
          // real call, since inline assistant config from the browser
          // is all Vapi's client SDK ever sends unless told otherwise.
          ...(systemPrompt ? { messages: [{ role: "system" as const, content: systemPrompt }] } : {}),
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
        // Routes tool-calls and the end-of-call report back to our
        // webhook for this specific company/employee during the call.
        ...(serverUrl ? { server: { url: serverUrl } } : {}),
      } as VapiStartParam;

      await vapiRef.current.start(assistantConfig);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Failed to start live voice call";
      setError(errorMessage);
      setVoiceState("idle");
      stopTimer();
    }
  }, [startTimer, stopTimer, firstMessage, systemPrompt, tools, serverUrl, voiceId, voiceProvider, voiceModel, clearDemoTimeouts]);

  const endCall = useCallback(() => {
    // Marks this session as user-ended so a call still "connecting" (whose
    // stop() below is a no-op — see userEndedCallRef's declaration) is torn
    // down the moment it actually reaches call-start instead of resuming.
    userEndedCallRef.current = true;
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
  }, [stopTimer, clearDemoTimeouts, clearSpeakingTimeout]);

  const toggleMute = useCallback(() => {
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
    startCall,
    endCall,
    toggleMute,
  };
}
