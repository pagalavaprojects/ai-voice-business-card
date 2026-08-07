"use client";

import React from "react";
import { motion } from "framer-motion";
import { Mic, MicOff, Loader2, Volume2 } from "lucide-react";
import { WaveformVisualizer } from "./WaveformVisualizer";

export type VoiceState = "idle" | "connecting" | "listening" | "speaking" | "thinking";

interface VoiceMicButtonProps {
  state: VoiceState;
  isMuted?: boolean;
  onClick: () => void;
  ringActive?: boolean;
  disabled?: boolean;
  introCountdown?: number;
  /** Required, not defaulted: every caller resolves these against the
   * visitor's chosen language (see PublicBusinessCard), so a hardcoded
   * English fallback here would be exactly the kind of untranslated leak
   * a multilingual audit exists to catch. */
  ariaLabels: {
    idle: string;
    connecting: string;
    listening: string;
    speaking: string;
    thinking: string;
    disabled: string;
  };
}

export const VoiceMicButton = React.memo(function VoiceMicButton({
  state,
  isMuted,
  onClick,
  ringActive,
  disabled,
  introCountdown,
  ariaLabels,
}: VoiceMicButtonProps) {
  return (
    <div className="relative flex flex-col items-center justify-center py-4">
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
        // Stable, language-independent hook for e2e tests: aria-label is
        // fully translated (as it must be), so a test that needs to know
        // "the card has finished loading and rendered" without asserting on
        // a specific language's text reaches for this instead.
        data-testid="voice-mic-button"
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
          disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"
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
          <div className="flex flex-col items-center gap-1">
            <Volume2 className="h-8 w-8 text-sky-300 animate-pulse" />
            {introCountdown && introCountdown > 0 && (
              <span className="text-[10px] font-mono font-bold text-sky-200">{introCountdown}s</span>
            )}
          </div>
        ) : state === "connecting" || state === "thinking" ? (
          <Loader2 className="h-9 w-9 animate-spin text-sky-400" />
        ) : isMuted ? (
          <MicOff className="h-9 w-9 text-rose-400" />
        ) : state === "speaking" ? (
          <Volume2 className="h-9 w-9 text-white animate-pulse" />
        ) : (
          <Mic className="h-9 w-9 text-white" />
        )}
      </motion.button>

      {/* Audio Waveform Visualizer */}
      <WaveformVisualizer state={state} className="mt-3" />
    </div>
  );
});
