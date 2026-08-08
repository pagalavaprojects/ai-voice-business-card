/**
 * @jest-environment jsdom
 *
 * The browser-TTS pitch fallback keeps the pitches speaking when the
 * server can't render audio (e.g. TTS credits exhausted upstream). It must
 * stay strictly speak-only, use the right Indian locale per language, and
 * never surface our own deliberate stop as an error.
 */
import { speakPitchWithBrowserTts, stopBrowserTts, SPEECH_SYNTHESIS_LOCALES } from "@/features/voice/lib/pitchFallback";
import { SUPPORTED_LANGUAGES } from "@/features/language/config";

class FakeUtterance {
  text: string;
  lang = "";
  rate = 1;
  onstart: (() => void) | null = null;
  onend: (() => void) | null = null;
  onerror: ((e: { error: string }) => void) | null = null;
  constructor(text: string) {
    this.text = text;
  }
}

describe("speakPitchWithBrowserTts", () => {
  let speak: jest.Mock;
  let cancel: jest.Mock;

  beforeEach(() => {
    speak = jest.fn();
    cancel = jest.fn();
    Object.defineProperty(window, "speechSynthesis", {
      configurable: true,
      value: { speak, cancel },
    });
    (globalThis as Record<string, unknown>).SpeechSynthesisUtterance = FakeUtterance;
  });

  afterEach(() => {
    delete (globalThis as Record<string, unknown>).SpeechSynthesisUtterance;
  });

  const handlers = () => ({ onStart: jest.fn(), onEnd: jest.fn(), onError: jest.fn() });

  it("has an Indian-locale mapping for every supported language", () => {
    for (const lang of SUPPORTED_LANGUAGES) {
      expect(SPEECH_SYNTHESIS_LOCALES[lang.code]).toMatch(/-IN$/);
    }
  });

  it("cancels anything queued, then speaks the script with the language's locale", () => {
    const h = handlers();
    expect(speakPitchWithBrowserTts("வணக்கம், இது ஒரு சோதனை.", "ta", h)).toBe(true);

    expect(cancel).toHaveBeenCalled();
    expect(speak).toHaveBeenCalledTimes(1);
    const utterance = speak.mock.calls[0][0] as FakeUtterance;
    expect(utterance.text).toBe("வணக்கம், இது ஒரு சோதனை.");
    expect(utterance.lang).toBe("ta-IN");
  });

  it("wires start/end through to the handlers", () => {
    const h = handlers();
    speakPitchWithBrowserTts("hello", "en", h);
    const utterance = speak.mock.calls[0][0] as FakeUtterance;

    utterance.onstart?.();
    expect(h.onStart).toHaveBeenCalled();
    utterance.onend?.();
    expect(h.onEnd).toHaveBeenCalled();
    expect(h.onError).not.toHaveBeenCalled();
  });

  it("treats interrupted/canceled (our own stop) as a normal end, real errors as errors", () => {
    const h = handlers();
    speakPitchWithBrowserTts("hello", "en", h);
    const utterance = speak.mock.calls[0][0] as FakeUtterance;

    utterance.onerror?.({ error: "interrupted" });
    expect(h.onEnd).toHaveBeenCalledTimes(1);
    expect(h.onError).not.toHaveBeenCalled();

    utterance.onerror?.({ error: "synthesis-failed" });
    expect(h.onError).toHaveBeenCalledTimes(1);
  });

  it("returns false when the browser has no speechSynthesis, so the caller can show its error state", () => {
    delete (globalThis as Record<string, unknown>).SpeechSynthesisUtterance;
    const original = Object.getOwnPropertyDescriptor(window, "speechSynthesis");
    Object.defineProperty(window, "speechSynthesis", { configurable: true, value: undefined });
    // "speechSynthesis" in window is still true with value undefined, so
    // remove it outright to simulate a browser without the API.
    // @ts-expect-error deliberate deletion for the unsupported-browser case
    delete window.speechSynthesis;

    expect(speakPitchWithBrowserTts("hello", "en", handlers())).toBe(false);

    if (original) Object.defineProperty(window, "speechSynthesis", original);
  });

  it("stopBrowserTts cancels without throwing, even right after speaking", () => {
    speakPitchWithBrowserTts("hello", "en", handlers());
    expect(() => stopBrowserTts()).not.toThrow();
    expect(cancel).toHaveBeenCalledTimes(2); // once pre-speak, once on stop
  });
});
