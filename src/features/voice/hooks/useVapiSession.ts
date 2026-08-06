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

export interface UseVapiSessionOptions {
  companyId: string;
  employeeId: string;
  vapiPublicKey?: string;
  firstMessage?: string;
  systemPrompt?: string | null;
  tools?: unknown[];
  serverUrl?: string;
  voiceId?: OpenAIVoiceId | string;
}

export function useVapiSession({
  companyId,
  employeeId,
  vapiPublicKey,
  firstMessage,
  systemPrompt,
  tools,
  voiceId,
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

  const vapiRef = useRef<Vapi | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const isDemoModeRef = useRef<boolean>(false);
  // Flips true the moment the first assistant utterance is seen, and stays
  // true for the rest of THIS call — reset on every fresh call-start, so a
  // page refresh or a new session correctly plays the intro again.
  const hasHadFirstAssistantSpeechRef = useRef<boolean>(false);

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
    const isDemoKey = !publicKey || publicKey === "demo-vapi-key" || publicKey.includes("demo");
    isDemoModeRef.current = isDemoKey;

    if (isDemoKey) {
      // Demo Voice Session Initialization (No external 401 WebRTC error)
      return () => {
        stopTimer();
      };
    }

    try {
      const vapi = new Vapi(publicKey);
      vapiRef.current = vapi;

      vapi.on("call-start", () => {
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
        stopTimer();
      });

      vapi.on("speech-start", () => {
        setVoiceState("listening");
        // A visitor talking over the greeting is exactly the "user
        // interrupted" case — firstMessageInterruptionsEnabled (below) makes
        // Vapi itself stop the greeting's audio; this makes sure the UI's
        // "Introducing…" label drops the instant that happens, rather than
        // lingering until the 3s timer below would otherwise have cleared it.
        setIsPlayingIntro(false);
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
            // before the intro tracking was added.
            setTimeout(() => {
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
        stopTimer();
      });

      return () => {
        vapi.stop();
        stopTimer();
      };
    } catch (err: unknown) {
      console.warn("Vapi SDK setup warning:", err);
      isDemoModeRef.current = true;
    }
  }, [vapiPublicKey, startTimer, stopTimer]);

  const startCall = useCallback(async () => {
    setError(null);

    // If using Demo Mode (Local Testing without live Vapi keys)
    if (isDemoModeRef.current || !vapiRef.current) {
      setVoiceState("connecting");
      startTimer();
      hasHadFirstAssistantSpeechRef.current = false;

      setTimeout(() => {
        setVoiceState("speaking");
        setIsPlayingIntro(true);
        hasHadFirstAssistantSpeechRef.current = true;
        setMessages([
          {
            role: "assistant",
            content: firstMessage || DEFAULT_FIRST_MESSAGE,
          },
        ]);
        setTimeout(() => {
          setVoiceState("listening");
          setIsPlayingIntro(false);
        }, 2500);
      }, 600);

      return;
    }

    // Live WebRTC Voice Call with Vapi SDK
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
        voice: {
          provider: "openai" as const,
          voiceId: voiceId || DEFAULT_VOICE_ID,
          // The Vapi Web SDK has no output-volume/gain control at all — its
          // only mic-side lever is increaseMicLevel(), which adjusts what the
          // visitor's microphone sends, not what the assistant is heard at.
          // Playback loudness is the listener's own device volume. The one
          // real lever OpenAI's TTS exposes for perceived quality is the
          // synthesis model itself: "tts-1" (the implicit default) is tuned
          // for low latency, "tts-1-hd" for fidelity. A voice business card
          // is not latency-sensitive the way a phone IVR is, so trading a
          // small amount of latency for materially clearer, more present
          // audio is a straightforward improvement with no quality downside.
          model: "tts-1-hd" as const,
        },
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
  }, [startTimer, stopTimer, firstMessage, systemPrompt, tools, serverUrl, voiceId]);

  const endCall = useCallback(() => {
    if (vapiRef.current && !isDemoModeRef.current) {
      try {
        vapiRef.current.stop();
      } catch (err) {
        console.warn("Vapi stop exception:", err);
      }
    }
    setVoiceState("idle");
    stopTimer();
  }, [stopTimer]);

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
    startCall,
    endCall,
    toggleMute,
  };
}
