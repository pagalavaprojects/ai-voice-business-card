"use client";

import { Globe } from "lucide-react";
import { SUPPORTED_LANGUAGES, LanguageCode } from "../config";

interface LanguageSelectorProps {
  language: LanguageCode;
  onChange: (code: LanguageCode) => void;
  /** Announced to screen readers and used as the visible label fallback —
   * pass the current locale's own translation so the control's own label
   * switches languages too. */
  label: string;
  className?: string;
}

/**
 * A native <select> rather than a hand-rolled dropdown, deliberately: a
 * native control gets full keyboard support, screen-reader semantics, and
 * (for free, from the OS) a bottom-sheet picker on iOS and a native dialog
 * on Android — exactly the "dropdown on desktop, bottom sheet on mobile"
 * split asked for, without a second, custom-built mobile code path to
 * maintain and keep accessible.
 */
export function LanguageSelector({ language, onChange, label, className }: LanguageSelectorProps) {
  // className (e.g. the parent's "absolute right-4 top-4" placement) goes on
  // this OUTER wrapper, never merged into the inner div below — that inner
  // div's own "relative" is load-bearing (the Globe icon and chevron
  // position against it) and would silently fight a caller-supplied
  // "absolute", with whichever rule Tailwind happens to generate last
  // winning. Keeping the two positioning contexts on separate elements
  // means neither can ever clobber the other.
  return (
    <div className={className}>
      <div className="relative inline-flex items-center">
        <Globe className="pointer-events-none absolute left-2.5 h-3.5 w-3.5 text-sky-400" aria-hidden="true" />
        <select
          aria-label={label}
          // lang on the control itself (not just the page) so assistive tech
          // announces each option in its own language rather than the page's.
          value={language}
          onChange={(e) => onChange(e.target.value as LanguageCode)}
          className="appearance-none rounded-full bg-white/[0.06] border border-white/[0.1] hover:border-sky-400/40 text-[11px] font-semibold text-slate-200 pl-8 pr-6 py-1.5 focus:outline-none focus:ring-2 focus:ring-sky-500 cursor-pointer transition-colors"
        >
          {SUPPORTED_LANGUAGES.map((l) => (
            <option key={l.code} value={l.code} lang={l.code} className="bg-slate-900 text-slate-100">
              {l.nativeName}
            </option>
          ))}
        </select>
        {/* Custom chevron over the native control's own (browser-styled,
            inconsistent-looking) arrow, which is suppressed via appearance-none
            above. */}
        <svg
          className="pointer-events-none absolute right-2 h-3 w-3 text-slate-400"
          viewBox="0 0 12 12"
          fill="none"
          aria-hidden="true"
        >
          <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    </div>
  );
}
