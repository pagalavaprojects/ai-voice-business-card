"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Vapi from "@vapi-ai/web";
import { VoiceState } from "../components/VoiceMicButton";
import { MessageItem } from "../components/TranscriptViewer";

export interface UseVapiSessionOptions {
  companyId: string;
  employeeId: string;
  vapiPublicKey?: string;
}

export function useVapiSession({ companyId, employeeId, vapiPublicKey }: UseVapiSessionOptions) {
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
            content: "Hello! Thank you for scanning my business card. How can I help you today?",
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

      await vapiRef.current.start({
        firstMessage: "Hello! Thank you for scanning my business card. How can I help you today?",
        model: {
          provider: "openai",
          model: "gpt-4o-mini",
        },
      });
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Failed to start live voice call";
      setError(errorMessage);
      setVoiceState("idle");
      stopTimer();
    }
  }, [startTimer, stopTimer]);

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
