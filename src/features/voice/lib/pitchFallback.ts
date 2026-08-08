import { LanguageCode } from "@/features/language/config";

/** BCP-47 voice locales for the browser speech-synthesis fallback. Indian
 * locales throughout — this product's audience — with the plain subtag as
 * the browser's own fuzzy match fallback if no exact voice is installed. */
export const SPEECH_SYNTHESIS_LOCALES: Record<LanguageCode, string> = {
  en: "en-IN",
  ta: "ta-IN",
  hi: "hi-IN",
  te: "te-IN",
  ml: "ml-IN",
  kn: "kn-IN",
};

export interface BrowserTtsHandlers {
  onStart: () => void;
  onEnd: () => void;
  onError: () => void;
}

/**
 * Speaks a pitch script with the browser's own built-in speech synthesis —
 * the zero-dependency fallback used when the server's rendered MP3 is
 * unavailable (e.g. TTS credits exhausted upstream). Still strictly
 * speak-only: the Web Speech synthesis API involves no microphone, no
 * permission prompt, and no network round trip. Returns false when the
 * browser has no speechSynthesis at all, so the caller can show its error
 * state instead of failing silently.
 */
export function speakPitchWithBrowserTts(
  script: string,
  language: LanguageCode,
  handlers: BrowserTtsHandlers
): boolean {
  if (typeof window === "undefined" || !("speechSynthesis" in window) || typeof SpeechSynthesisUtterance === "undefined") {
    return false;
  }
  // Any queued/ongoing utterance would otherwise delay this one invisibly.
  window.speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(script);
  utterance.lang = SPEECH_SYNTHESIS_LOCALES[language] ?? "en-IN";
  utterance.rate = 1;
  utterance.onstart = handlers.onStart;
  utterance.onend = handlers.onEnd;
  utterance.onerror = (e: SpeechSynthesisErrorEvent) => {
    // "interrupted"/"canceled" fire on our own deliberate stopPitch() —
    // routing those through onError would flash the error banner on every
    // normal stop.
    if (e.error === "interrupted" || e.error === "canceled") handlers.onEnd();
    else handlers.onError();
  };
  window.speechSynthesis.speak(utterance);
  return true;
}

export function stopBrowserTts(): void {
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }
}

/** True pause/resume for the browser-TTS pitch path — the utterance keeps
 * its position, so Resume continues mid-sentence rather than restarting.
 * (cancel() above is the full stop; these two are the Pause control.) */
export function pauseBrowserTts(): void {
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    window.speechSynthesis.pause();
  }
}

export function resumeBrowserTts(): void {
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    window.speechSynthesis.resume();
  }
}
