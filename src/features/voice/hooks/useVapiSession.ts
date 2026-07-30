"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Vapi from "@vapi-ai/web";
import { VoiceState } from "../components/VoiceMicButton";
import { MessageItem } from "../components/TranscriptViewer";

const DEFAULT_FIRST_MESSAGE = "Hi! I'm Srinivasan Kandasamy from Pagalava Data Analytics. Thank you for scanning my AI business card. How can I help you today?";

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
}

export function useVapiSession({
  companyId,
  employeeId,
  vapiPublicKey,
  firstMessage,
  systemPrompt,
  tools,
  serverUrl,
}: UseVapiSessionOptions) {
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [isMuted, setIsMuted] = useState(false);
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [durationSeconds, setDurationSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const vapiRef = useRef<Vapi | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const isDemoModeRef = useRef<boolean>(false);

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
      });

      vapi.on("call-end", () => {
        setVoiceState("idle");
        stopTimer();
      });

      vapi.on("speech-start", () => {
        setVoiceState("listening");
      });

      vapi.on("speech-end", () => {
        setVoiceState("thinking");
      });

      vapi.on("message", (message: { type: string; transcriptType?: string; role?: string; transcript?: string }) => {
        if (message.type === "transcript" && message.transcriptType === "final" && message.transcript) {
          const role = message.role === "user" ? "user" : "assistant";
          setMessages((prev) => [...prev, { role, content: message.transcript as string }]);
          if (role === "assistant") {
            setVoiceState("speaking");
            setTimeout(() => setVoiceState("listening"), 3000);
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

      setTimeout(() => {
        setVoiceState("speaking");
        setMessages([
          {
            role: "assistant",
            content: firstMessage || DEFAULT_FIRST_MESSAGE,
          },
        ]);
        setTimeout(() => {
          setVoiceState("listening");
        }, 2500);
      }, 600);

      return;
    }

    // Live WebRTC Voice Call with Vapi SDK
    try {
      setVoiceState("connecting");

      const assistantConfig = {
        firstMessage: firstMessage || DEFAULT_FIRST_MESSAGE,
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
  }, [startTimer, stopTimer, firstMessage, systemPrompt, tools, serverUrl]);

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
    startCall,
    endCall,
    toggleMute,
  };
}
