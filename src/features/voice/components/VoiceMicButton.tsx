"use client";

import React from "react";
import { motion } from "framer-motion";
import { Mic, MicOff, Loader2, Volume2 } from "lucide-react";

export type VoiceState = "idle" | "connecting" | "listening" | "speaking" | "thinking";

interface VoiceMicButtonProps {
  state: VoiceState;
  isMuted?: boolean;
  onClick: () => void;
}

export const VoiceMicButton: React.FC<VoiceMicButtonProps> = ({ state, isMuted, onClick }) => {
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

      {/* Main Touch Button */}
      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={onClick}
        aria-label={
          state === "idle"
            ? "Start voice conversation with AI Twin"
            : state === "connecting"
            ? "Connecting to AI Twin, please wait"
            : state === "listening"
            ? "AI Twin is listening — speak now"
            : state === "speaking"
            ? "AI Twin is speaking"
            : "AI Twin is processing your message"
        }
        className={`relative z-10 flex h-28 w-28 items-center justify-center rounded-full shadow-2xl backdrop-blur-xl transition-all duration-300 ${
          state === "idle"
            ? "bg-slate-800/80 border border-white/20 text-slate-100 shadow-sky-500/10 hover:border-sky-400/50"
            : state === "connecting" || state === "thinking"
            ? "bg-sky-950/80 border border-sky-400/50 text-sky-300"
            : state === "speaking"
            ? "bg-gradient-to-tr from-sky-500 to-indigo-500 text-white shadow-sky-500/40"
            : "bg-sky-500 text-white shadow-sky-500/50"
        }`}
      >
        {state === "connecting" || state === "thinking" ? (
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
