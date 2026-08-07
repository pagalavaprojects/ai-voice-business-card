"use client";

import React from "react";
import { motion } from "framer-motion";

interface WaveformVisualizerProps {
  state: "idle" | "connecting" | "listening" | "speaking" | "thinking";
  className?: string;
}

export const WaveformVisualizer = React.memo(function WaveformVisualizer({ state, className = "" }: WaveformVisualizerProps) {
  if (state === "idle") return null;

  const barCount = 5;
  const isSpeaking = state === "speaking";
  const isListening = state === "listening";

  return (
    <div className={`flex items-center justify-center gap-1.5 h-8 px-4 ${className}`} aria-hidden="true">
      {Array.from({ length: barCount }).map((_, i) => (
        <motion.span
          key={i}
          className={`w-1 rounded-full ${
            isSpeaking
              ? "bg-gradient-to-t from-sky-400 to-indigo-400"
              : isListening
              ? "bg-gradient-to-t from-emerald-400 to-teal-400"
              : "bg-sky-400/40"
          }`}
          animate={
            isSpeaking || isListening
              ? {
                  height: [
                    "8px",
                    `${16 + ((i * 7) % 16)}px`,
                    "8px",
                    `${20 + ((i * 9) % 12)}px`,
                    "8px",
                  ],
                }
              : { height: "6px" }
          }
          transition={
            isSpeaking || isListening
              ? {
                  duration: 1.2,
                  repeat: Infinity,
                  ease: "easeInOut",
                  delay: i * 0.15,
                }
              : { duration: 0.3 }
          }
        />
      ))}
    </div>
  );
});
