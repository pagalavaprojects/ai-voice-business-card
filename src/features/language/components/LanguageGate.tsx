"use client";

import { useRef, useState } from "react";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { SUPPORTED_LANGUAGES, LanguageCode, hasConfirmedSpeechRecognition } from "../config";

interface LanguageGateProps {
  /** Pre-selected so "Continue" is always immediately actionable — the
   * visitor's detected/remembered language, not a forced empty choice. */
  initialLanguage: LanguageCode;
  /** The company's enabled-language set, from the card API's
   * `enabledLanguages`. Undefined/empty offers every platform language —
   * the same inherit-all default used server-side and in LanguageSelector. */
  enabledLanguages?: LanguageCode[];
  onContinue: (code: LanguageCode) => void;
  /** Translator for the gate's OWN chrome ("Choose your preferred
   * language", "Continue"...), resolved against `initialLanguage` by the
   * caller (PublicBusinessCard already runs useLanguage() once and detects
   * a starting language before this screen ever renders — see there). This
   * is deliberately NOT hardcoded English: the one screen whose entire job
   * is letting a non-English speaker pick their language was, until this
   * fix, only ever presented in English regardless of who was looking at
   * it — the exact irony a real audit should catch. Each language card's
   * own name (e.g. "தமிழ்") is never translated — a language's name in
   * its own script is what identifies it, in every UI language equally. */
  t: (key: string, vars?: Record<string, string>) => string;
}

/**
 * The pre-conversation "choose your language" screen — shown once, before
 * the voice conversation begins (see PublicBusinessCard, which skips this
 * entirely on a return visit with a stored preference). A real radiogroup
 * (role="radiogroup" + roving tabindex, arrow-key navigation between cards)
 * rather than a plain button grid, so it's genuinely keyboard-operable, not
 * just clickable.
 *
 * Dark by default, matching the rest of this platform's existing dark
 * theme (this is explicitly not a redesign) — but every color here also
 * has a light-mode value via prefers-color-scheme, so a visitor whose OS
 * is set to light mode still gets a legible, considered screen rather than
 * a forced-dark one.
 */
export function LanguageGate({ initialLanguage, enabledLanguages, onContinue, t }: LanguageGateProps) {
  const [selected, setSelected] = useState<LanguageCode>(initialLanguage);
  const cardRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const languages = enabledLanguages && enabledLanguages.length > 0
    ? SUPPORTED_LANGUAGES.filter((l) => enabledLanguages.includes(l.code))
    : SUPPORTED_LANGUAGES;
  const codes = languages.map((l) => l.code);

  const focusCard = (code: LanguageCode) => cardRefs.current[code]?.focus();

  const handleKeyDown = (e: React.KeyboardEvent, index: number) => {
    // Standard radiogroup keyboard pattern: arrow keys move focus AND
    // selection together (this is how a native radio group behaves),
    // Home/End jump to the ends. Tab leaves the group entirely — only one
    // card is ever a tab stop (the selected one), everything else is -1.
    const cols = window.innerWidth >= 640 ? 3 : 1;
    let nextIndex: number | null = null;
    if (e.key === "ArrowRight") nextIndex = (index + 1) % codes.length;
    else if (e.key === "ArrowLeft") nextIndex = (index - 1 + codes.length) % codes.length;
    else if (e.key === "ArrowDown") nextIndex = (index + cols) % codes.length;
    else if (e.key === "ArrowUp") nextIndex = (index - cols + codes.length) % codes.length;
    else if (e.key === "Home") nextIndex = 0;
    else if (e.key === "End") nextIndex = codes.length - 1;
    else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onContinue(selected);
      return;
    }
    if (nextIndex !== null) {
      e.preventDefault();
      const code = codes[nextIndex];
      setSelected(code);
      focusCard(code);
    }
  };

  return (
    <main
      className="min-h-screen flex items-center justify-center p-4 sm:p-6"
      style={{
        background:
          "radial-gradient(ellipse at top, rgba(56,189,248,0.08), transparent 60%), var(--gate-bg, #070b12)",
      }}
    >
      <style>{`
        @media (prefers-color-scheme: light) {
          .lang-gate-panel { --gate-bg: #f8fafc; --gate-panel: #ffffff; --gate-border: #e2e8f0; --gate-ink: #0f172a; --gate-ink-muted: #64748b; --gate-card: #f8fafc; --gate-card-hover: #f1f5f9; }
        }
        .lang-gate-panel { --gate-bg: #070b12; --gate-panel: rgba(255,255,255,0.03); --gate-border: rgba(255,255,255,0.08); --gate-ink: #f8fafc; --gate-ink-muted: #94a3b8; --gate-card: rgba(255,255,255,0.03); --gate-card-hover: rgba(255,255,255,0.07); }
      `}</style>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="lang-gate-panel w-full max-w-2xl rounded-3xl border p-6 sm:p-10 shadow-2xl"
        style={{ background: "var(--gate-panel)", borderColor: "var(--gate-border)", color: "var(--gate-ink)" }}
      >
        <div className="text-center mb-8 sm:mb-10">
          <div className="mx-auto mb-4 h-11 w-11 rounded-2xl bg-gradient-to-tr from-sky-500 to-indigo-500 flex items-center justify-center shadow-lg shadow-sky-500/30">
            <span className="text-lg" aria-hidden="true">🌐</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight">{t("gate.title")}</h1>
          <p className="mt-1.5 text-sm" style={{ color: "var(--gate-ink-muted)" }}>
            {t("gate.subtitle")}
          </p>
        </div>

        <div role="radiogroup" aria-label={t("aria.chooseLanguage")} className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {languages.map((lang, index) => {
            const isSelected = selected === lang.code;
            const sttConfirmed = hasConfirmedSpeechRecognition(lang.code);
            return (
              <motion.button
                key={lang.code}
                ref={(el) => {
                  cardRefs.current[lang.code] = el;
                }}
                type="button"
                role="radio"
                aria-checked={isSelected}
                tabIndex={isSelected ? 0 : -1}
                onKeyDown={(e) => handleKeyDown(e, index)}
                onClick={() => setSelected(lang.code)}
                onDoubleClick={() => onContinue(lang.code)}
                whileHover={{ scale: 1.03, y: -2 }}
                whileTap={{ scale: 0.98 }}
                className="group relative flex flex-col items-center gap-1.5 rounded-2xl border p-4 sm:p-5 text-center transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
                style={{
                  background: isSelected ? "rgba(56,189,248,0.1)" : "var(--gate-card)",
                  borderColor: isSelected ? "#38bdf8" : "var(--gate-border)",
                }}
              >
                {isSelected && (
                  <motion.span
                    layoutId="lang-gate-selected-ring"
                    className="absolute inset-0 rounded-2xl ring-2 ring-sky-400 pointer-events-none"
                    transition={{ type: "spring", stiffness: 500, damping: 35 }}
                  />
                )}
                <span className="text-2xl sm:text-3xl" aria-hidden="true">{lang.flag}</span>
                <span className="text-base sm:text-lg font-bold" lang={lang.code}>{lang.nativeName}</span>
                <span className="text-[11px]" style={{ color: "var(--gate-ink-muted)" }}>{lang.name}</span>
                {!sttConfirmed && (
                  <span className="mt-0.5 text-[9px] uppercase tracking-wide text-amber-400/90">{t("gate.sttPending")}</span>
                )}
              </motion.button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={() => onContinue(selected)}
          className="mt-8 w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-sky-500 to-indigo-500 py-3.5 text-sm font-semibold text-white shadow-lg shadow-sky-500/25 transition-transform hover:scale-[1.01] active:scale-[0.99] focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
        >
          {t("gate.continue")}
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </button>
      </motion.div>
    </main>
  );
}
