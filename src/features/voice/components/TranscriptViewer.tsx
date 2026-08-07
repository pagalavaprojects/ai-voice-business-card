"use client";

import React, { useState } from "react";
import { ChevronDown, ChevronUp, MessageSquare } from "lucide-react";
import { Card } from "@/shared/ui/card";

export interface MessageItem {
  role: "user" | "assistant";
  content: string;
}

interface TranscriptViewerProps {
  messages: MessageItem[];
  /** Translator, resolved by the caller (see PublicBusinessCard) —
   * follows the same t-as-prop convention as LanguageGate/AppointmentModal
   * rather than calling useLanguage() again here. */
  t: (key: string, vars?: Record<string, string>) => string;
}

export const TranscriptViewer: React.FC<TranscriptViewerProps> = ({ messages, t }) => {
  const [isOpen, setIsOpen] = useState(false);

  if (messages.length === 0) return null;

  return (
    <Card className="w-full bg-slate-900/60 border-white/[0.08] backdrop-blur-md p-4 transition-all">
      <button
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        aria-controls="transcript-panel"
        className="flex w-full items-center justify-between text-xs font-semibold text-slate-300 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 rounded"
      >
        <span className="flex items-center gap-1.5">
          <MessageSquare className="h-3.5 w-3.5 text-sky-400" aria-hidden="true" />
          {t("transcript.heading", { count: String(messages.length) })}
        </span>
        {isOpen ? <ChevronUp className="h-4 w-4" aria-hidden="true" /> : <ChevronDown className="h-4 w-4" aria-hidden="true" />}
      </button>

      {isOpen && (
        <div
          id="transcript-panel"
          aria-live="polite"
          aria-atomic="false"
          aria-label={t("transcript.ariaLabel")}
          className="mt-3 max-h-48 overflow-y-auto space-y-2 pr-1 text-xs leading-relaxed border-t border-white/[0.06] pt-3"
        >
          {messages.map((msg, idx) => (
            <div
              key={`${msg.role}-${idx}-${msg.content.slice(0, 10)}`}
              className={`p-2 rounded-lg ${
                msg.role === "user"
                  ? "bg-sky-500/10 text-sky-200 border border-sky-500/20 ml-4"
                  : "bg-white/[0.04] text-slate-200 border border-white/[0.06] mr-4"
              }`}
            >
              <span className="font-bold block text-[10px] uppercase text-slate-400 mb-0.5">
                {msg.role === "user" ? t("transcript.you") : t("transcript.aiTwin")}
              </span>
              {msg.content}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
};
