"use client";

import React from "react";
import { motion } from "framer-motion";
import { Mic, MicOff, Loader2, Volume2 } from "lucide-react";

export type VoiceState = "idle" | "connecting" | "listening" | "speaking" | "thinking";

interface VoiceMicButtonProps {
  state: VoiceState;
  isMuted?: boolean;
  onClick: () => void;
  /** True when autoplay was blocked and the visitor needs to tap to start —
   * draws an attention ring sized to match the button's own circle, rather
   * than a wrapping div (which squares off into a pill against the button's
   * rectangular layout box). */
  ringActive?: boolean;
  /** True while the scripted opening is playing — the mic is force-muted at
   * the SDK level for this whole window (see useVapiSession.ts), so the
   * button itself is inert too rather than looking tappable and doing
   * nothing useful. */
  disabled?: boolean;
  /** Translated announcements for each state — supplied by the caller
   * (which has the visitor's chosen language) rather than this component
   * importing the language hook itself, so VoiceMicButton stays a plain,
   * reusable, language-agnostic control. Falls back to English so any
   * existing caller that hasn't been updated keeps working unchanged. */
  ariaLabels?: {
    idle: string;
    connecting: string;
    listening: string;
    speaking: string;
    thinking: string;
    disabled: string;
  };
}

const DEFAULT_ARIA_LABELS = {
  idle: "Start voice conversation with AI Twin",
  connecting: "Connecting to AI Twin, please wait",
  listening: "AI Twin is listening — speak now",
  speaking: "AI Twin is speaking",
  thinking: "AI Twin is processing your message",
  disabled: "Playing introduction — please wait",
};

export const VoiceMicButton: React.FC<VoiceMicButtonProps> = ({ state, isMuted, onClick, ringActive, disabled, ariaLabels = DEFAULT_ARIA_LABELS }) => {
  return (
    <div className="relative flex items-center justify-center py-6">
      {/* Pulsing Concentric Outer Rings for Listening/Speaking State */}
      {(state === "listening" || state === "speaking") && (
        <>
          <motion.div
            className="absolute h-36 w-36 rounded-full bg-sky-500/20 border border-sky-500/30"
            animate={{ scale: [1, 1.35, 1], opacity: [0.4, 0.9, 0.4] }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
          />
          <motion.div
            className="absolute h-48 w-48 rounded-full bg-sky-400/10 border border-sky-400/20"
            animate={{ scale: [1, 1.25, 1], opacity: [0.2, 0.6, 0.2] }}
            transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut", delay: 0.2 }}
          />
        </>
      )}

      {ringActive && (
        <div className="absolute h-32 w-32 rounded-full motion-safe:animate-pulse ring-4 ring-sky-400/40" />
      )}

      {/* Main Touch Button */}
      <motion.button
        whileHover={disabled ? undefined : { scale: 1.05 }}
        whileTap={disabled ? undefined : { scale: 0.95 }}
        onClick={disabled ? undefined : onClick}
        disabled={disabled}
        aria-disabled={disabled || undefined}
        aria-label={
          disabled
            ? ariaLabels.disabled
            : state === "idle"
            ? ariaLabels.idle
            : state === "connecting"
            ? ariaLabels.connecting
            : state === "listening"
            ? ariaLabels.listening
            : state === "speaking"
            ? ariaLabels.speaking
            : ariaLabels.thinking
        }
        className={`relative z-10 flex h-28 w-28 items-center justify-center rounded-full shadow-2xl backdrop-blur-xl transition-all duration-300 ${
          disabled ? "cursor-not-allowed opacity-60" : ""
        } ${
          state === "idle"
            ? "bg-slate-800/80 border border-white/20 text-slate-100 shadow-sky-500/10 hover:border-sky-400/50"
            : state === "connecting" || state === "thinking"
            ? "bg-sky-950/80 border border-sky-400/50 text-sky-300"
            : state === "speaking"
            ? "bg-gradient-to-tr from-sky-500 to-indigo-500 text-white shadow-sky-500/40"
            : "bg-sky-500 text-white shadow-sky-500/50"
        }`}
      >
        {disabled ? (
          <MicOff className="h-10 w-10 text-sky-300/70" />
        ) : state === "connecting" || state === "thinking" ? (
          <Loader2 className="h-10 w-10 animate-spin text-sky-400" />
        ) : isMuted ? (
          <MicOff className="h-10 w-10 text-rose-400" />
        ) : state === "speaking" ? (
          <Volume2 className="h-10 w-10 animate-bounce" />
        ) : (
          <Mic className="h-10 w-10" />
        )}
      </motion.button>
    </div>
  );
};
