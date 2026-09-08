/**
 * @jest-environment jsdom
 *
 * The Introduction section's two primary actions (2026-09-08):
 *
 *   [ AI Conversation ]  [ Introduction ]
 *
 * "Introduction" is the ONE recorded-introduction control — play → pause ⇄
 * resume → replay through the existing playPitch("intro") path (same cached
 * asset, never Vapi). "AI Conversation" starts the live conversation through
 * the ONE shared startAiConversation path. Nothing here creates a second
 * audio pipeline, a second Vapi initialisation, or a listen event that is
 * not a genuine click.
 */
import "@testing-library/jest-dom";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { PublicBusinessCard } from "@/features/voice/components/PublicBusinessCard";
import enBundle from "@/features/language/locales/en.json";
import taBundle from "@/features/language/locales/ta.json";
import hiBundle from "@/features/language/locales/hi.json";
import teBundle from "@/features/language/locales/te.json";
import mlBundle from "@/features/language/locales/ml.json";
import knBundle from "@/features/language/locales/kn.json";

const startCall = jest.fn();
const endCall = jest.fn();
const mockVoice: { voiceState: string } = { voiceState: "idle" };
jest.mock("@/features/voice/hooks/useVapiSession", () => ({
  useVapiSession: () => ({
    voiceState: mockVoice.voiceState,
    isMuted: false,
    messages: [],
    durationSeconds: 0,
    error: null,
    isPlayingIntro: false,
    isDemoMode: true,
    callId: null,
    startCall,
    endCall,
    toggleMute: jest.fn(),
  }),
}));

class FakeAudio {
  static instances: FakeAudio[] = [];
  src: string;
  paused = false;
  playCalls = 0;
  onplaying: (() => void) | null = null;
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(src: string) {
    this.src = src;
    FakeAudio.instances.push(this);
  }
  // Mirror HTMLMediaElement: play() clears paused and is counted, so a
  // "resume" is provable to have actually re-started the element (not just
  // flipped a React flag), and pause() sets it — exactly like the real one.
  play() {
    this.paused = false;
    this.playCalls++;
    return Promise.resolve();
  }
  pause() {
    this.paused = true;
  }
}
const RealAudio = global.Audio;

function cardResponse(language: string) {
  return {
    ok: true,
    status: 200,
    json: () =>
      Promise.resolve({
        company: { name: "Pagalava Data Analytics", website: "https://maylaanai.com", logoUrl: null },
        employee: { name: "Srinivasan Kandasamy", designation: "Founder", email: "s@pagalava.com", phone: "+911234567890", officeAddress: null, workingHours: null, avatarUrl: null },
        firstMessage: "Hello.",
        systemPrompt: "PROMPT",
        language,
        enabledLanguages: ["en", "ta", "hi", "kn", "te", "ml"],
        tools: [],
        serverUrl: "https://maylaanai.com/api/vapi/webhook",
      }),
  };
}

async function mountCard(lang: "en" | "ta" | "hi" | "te" | "ml" | "kn") {
  window.localStorage.clear();
  window.localStorage.setItem("pagalava.language", lang);
  global.fetch = jest.fn(() => Promise.resolve(cardResponse(lang))) as unknown as typeof fetch;
  render(<PublicBusinessCard companyId="comp-1" employeeId="emp-1" />);
  await screen.findByTestId("voice-mic-button");
  return { ai: () => screen.getByTestId("ai-conversation"), intro: () => screen.getByTestId("intro-action") };
}
const listenPosts = () =>
  (global.fetch as jest.Mock).mock.calls.filter((c) => String(c[0]).includes("/listen") && (c[1] as { method?: string } | undefined)?.method === "POST");
const eventTypes = () => listenPosts().map((c) => JSON.parse(String((c[1] as { body: string }).body)).eventType);
const settle = () =>
  act(async () => {
    await Promise.resolve();
  });

beforeEach(() => {
  startCall.mockClear();
  endCall.mockClear();
  mockVoice.voiceState = "idle";
  FakeAudio.instances = [];
  (global as unknown as { Audio: unknown }).Audio = FakeAudio;
});
afterEach(() => {
  (global as unknown as { Audio: unknown }).Audio = RealAudio;
});

describe("both actions are visible from the start, as real labelled buttons", () => {
  it("renders [AI Conversation] [Introduction] in the Introduction section on load — no audio, no Vapi, no listen event", async () => {
    const { ai, intro } = await mountCard("en");
    await settle();
    expect(ai().tagName).toBe("BUTTON");
    expect(intro().tagName).toBe("BUTTON");
    expect(ai()).toHaveTextContent("AI Conversation");
    expect(intro()).toHaveTextContent("Introduction");
    expect(screen.getByRole("button", { name: /^Introduction — Play Introduction$/ })).toBe(intro());
    expect(screen.getByRole("button", { name: "AI Conversation" })).toBe(ai());
    expect(intro()).toHaveAttribute("data-state", "idle");
    expect(intro()).not.toHaveAttribute("aria-busy");
    // State changes are announced politely (no focus stealing).
    expect(screen.getByTestId("intro-state-label")).toHaveAttribute("aria-live", "polite");
    // Both sit in one row in the preferred order.
    const row = screen.getByTestId("intro-actions");
    expect([...row.querySelectorAll("button")].map((b) => b.getAttribute("data-testid"))).toEqual(["ai-conversation", "intro-action"]);
    // Touch-sized, keyboard-reachable, not disabled.
    for (const b of [ai(), intro()]) {
      expect(b.className).toMatch(/min-h-\[44px\]/);
      expect(b).not.toBeDisabled();
      expect(b.getAttribute("tabindex")).not.toBe("-1");
    }
    expect(FakeAudio.instances).toHaveLength(0);
    expect(startCall).not.toHaveBeenCalled();
    expect(listenPosts()).toHaveLength(0);
  });

  it("is hidden only while a live AI call is running (the call's own controls take over)", async () => {
    mockVoice.voiceState = "listening";
    await mountCard("en");
    expect(screen.queryByTestId("intro-actions")).toBeNull();
  });
});

describe("Introduction — the existing playback path: play → pause ⇄ resume → replay", () => {
  it("plays the cached introduction asset on click and records exactly one intro_play", async () => {
    const { intro } = await mountCard("en");
    fireEvent.click(intro());
    expect(FakeAudio.instances).toHaveLength(1);
    expect(FakeAudio.instances[0].src).toContain("/pitch?type=intro&lang=en");
    expect(intro()).toHaveAttribute("data-state", "loading");
    // While the asset streams the control says so (not "Play") and is busy.
    expect(intro()).toHaveAccessibleName("Introduction — Preparing Voice…");
    expect(intro()).toHaveAttribute("aria-busy", "true");
    await act(async () => {
      FakeAudio.instances[0].onplaying?.();
    });
    expect(intro()).toHaveAttribute("data-state", "playing");
    expect(intro()).not.toHaveAttribute("aria-busy");
    expect(intro()).toHaveAccessibleName("Introduction — Pause");
    expect(screen.getByTestId("intro-state-label")).toHaveTextContent("Playing Introduction");
    await settle();
    expect(eventTypes()).toEqual(["intro_play"]);
    expect(startCall).not.toHaveBeenCalled();
  });

  it("a second click pauses, a third resumes — the SAME audio element, no new request, no new event", async () => {
    const { intro } = await mountCard("en");
    fireEvent.click(intro());
    await act(async () => {
      FakeAudio.instances[0].onplaying?.();
    });
    fireEvent.click(intro());
    expect(intro()).toHaveAttribute("data-state", "paused");
    expect(intro()).toHaveAccessibleName("Introduction — Resume");
    expect(FakeAudio.instances[0].paused).toBe(true);
    fireEvent.click(intro());
    expect(intro()).toHaveAttribute("data-state", "playing");
    // The SAME element actually resumed: no new element, and play() ran a
    // second time and cleared paused (not merely a React state flip).
    expect(FakeAudio.instances).toHaveLength(1);
    expect(FakeAudio.instances[0].paused).toBe(false);
    expect(FakeAudio.instances[0].playCalls).toBeGreaterThanOrEqual(2);
    await settle();
    expect(eventTypes()).toEqual(["intro_play"]);
  });

  it("after completion the same button replays the same asset and records intro_replay (not a second intro_play)", async () => {
    const { intro } = await mountCard("en");
    fireEvent.click(intro());
    await act(async () => {
      FakeAudio.instances[0].onplaying?.();
      FakeAudio.instances[0].onended?.();
    });
    expect(intro()).toHaveAttribute("data-state", "done");
    expect(intro()).toHaveAccessibleName("Introduction — Replay");
    expect(screen.getByTestId("intro-state-label")).toHaveTextContent("Tap to Speak");
    fireEvent.click(intro());
    expect(FakeAudio.instances).toHaveLength(2);
    expect(FakeAudio.instances[1].src).toContain("/pitch?type=intro&lang=en");
    await settle();
    expect(eventTypes()).toEqual(["intro_play", "intro_replay"]);
    expect(startCall).not.toHaveBeenCalled();
  });

  it("the mic button and the Introduction button drive the same player — never two overlapping introductions", async () => {
    const { intro } = await mountCard("en");
    fireEvent.click(screen.getByTestId("voice-mic-button"));
    await act(async () => {
      FakeAudio.instances[0].onplaying?.();
    });
    expect(intro()).toHaveAttribute("data-state", "playing");
    fireEvent.click(intro()); // pauses the mic-started playback
    expect(intro()).toHaveAttribute("data-state", "paused");
    expect(FakeAudio.instances).toHaveLength(1);
  });
});

describe("AI Conversation — the existing shared conversation path", () => {
  it("starts the live conversation through startCall with the approved opening — once, even on a double click, and records no listen event", async () => {
    const { ai } = await mountCard("en");
    act(() => {
      fireEvent.click(ai());
      fireEvent.click(ai());
    });
    expect(startCall).toHaveBeenCalledTimes(1);
    expect(startCall.mock.calls[0][0]).toEqual({ firstMessage: "Now you can ask your questions" });
    await settle();
    expect(listenPosts()).toHaveLength(0);
    expect(FakeAudio.instances).toHaveLength(0);
  });

  it("is the same handler after the introduction completes (no second implementation)", async () => {
    const { ai, intro } = await mountCard("en");
    fireEvent.click(intro());
    await act(async () => {
      FakeAudio.instances[0].onplaying?.();
      FakeAudio.instances[0].onended?.();
    });
    fireEvent.click(ai());
    expect(startCall).toHaveBeenCalledTimes(1);
    expect(startCall.mock.calls[0][0]).toEqual({ firstMessage: "Now you can ask your questions" });
  });
});

describe("localisation — every supported language resolves both labels", () => {
  const bundles: Record<string, { buttons: { introduction: string }; mic: { aiConversation: string } }> = {
    en: enBundle,
    ta: taBundle,
    hi: hiBundle,
    te: teBundle,
    ml: mlBundle,
    kn: knBundle,
  };
  it.each(Object.keys(bundles))("%s has non-empty buttons.introduction and mic.aiConversation", (lang) => {
    const b = bundles[lang];
    expect(typeof b.buttons.introduction).toBe("string");
    expect(b.buttons.introduction.trim().length).toBeGreaterThan(0);
    expect(b.buttons.introduction).not.toMatch(/^buttons\./);
    expect(b.mic.aiConversation.trim().length).toBeGreaterThan(0);
  });
  it("the Tamil card shows the Tamil label and never a raw key", async () => {
    const { ai, intro } = await mountCard("ta");
    expect(intro()).toHaveTextContent(taBundle.buttons.introduction);
    expect(intro()).toHaveTextContent("அறிமுகம்");
    expect(intro().textContent).not.toMatch(/buttons\./);
    expect(ai()).toHaveTextContent(taBundle.mic.aiConversation);
    fireEvent.click(intro());
    expect(FakeAudio.instances[0].src).toContain("/pitch?type=intro&lang=ta");
    expect(startCall).not.toHaveBeenCalled();
  });
});

// The browser-TTS fallback is the only other way the introduction can be
// voiced; a live call must never share the air with it.
const speakPitchWithBrowserTts = jest.fn();
const stopBrowserTts = jest.fn();
jest.mock("@/features/voice/lib/pitchFallback", () => ({
  speakPitchWithBrowserTts: (...a: unknown[]) => speakPitchWithBrowserTts(...a),
  stopBrowserTts: (...a: unknown[]) => stopBrowserTts(...a),
  pauseBrowserTts: jest.fn(),
  resumeBrowserTts: jest.fn(),
}));

describe("a live call fully stops the introduction — no second audio pipeline can outlive it", () => {
  beforeEach(() => {
    // These accumulate across the whole file (the module-level mock is never
    // auto-cleared, and the unmount cleanup in every prior test calls
    // stopBrowserTts). Reset so each assertion below counts only the calls
    // this test provokes.
    speakPitchWithBrowserTts.mockClear();
    stopBrowserTts.mockClear();
  });

  it("AI Conversation while the introduction is still LOADING: the call-start effect silences browser TTS, keeps the end-call control usable, and the stream deadline is discarded", async () => {
    jest.useFakeTimers();
    try {
      window.localStorage.clear();
      window.localStorage.setItem("pagalava.language", "en");
      global.fetch = jest.fn(() => Promise.resolve(cardResponse("en"))) as unknown as typeof fetch;
      const { rerender } = render(<PublicBusinessCard companyId="comp-1" employeeId="emp-1" />);
      await screen.findByTestId("voice-mic-button");

      fireEvent.click(screen.getByTestId("intro-action"));
      expect(FakeAudio.instances).toHaveLength(1);
      expect(screen.getByTestId("intro-action")).toHaveAttribute("data-state", "loading");

      // Clear NOW: the intro tap already ran stopPitch() → stopBrowserTts()
      // once. Anything counted after this point is provoked solely by the
      // call starting — so the assertion below is not satisfied by that
      // earlier call (the bug this guards was a call-start effect that
      // paused the element but never silenced browser TTS).
      stopBrowserTts.mockClear();

      // The visitor chooses AI Conversation before the introduction even
      // started streaming; the session goes live.
      fireEvent.click(screen.getByTestId("ai-conversation"));
      expect(startCall).toHaveBeenCalledTimes(1);
      mockVoice.voiceState = "connecting";
      rerender(<PublicBusinessCard companyId="comp-1" employeeId="emp-1" />);

      // The call-start effect — and only it — silenced browser TTS.
      expect(stopBrowserTts).toHaveBeenCalledTimes(1);
      expect(FakeAudio.instances[0].paused).toBe(true);
      expect(screen.queryByTestId("intro-actions")).toBeNull(); // the call's own controls take over
      // The mic button IS the end-call control during a call; the pre-fix
      // bug left it disabled (the fallback's onStart re-set pitchPlaying).
      expect(screen.getByTestId("voice-mic-button")).not.toBeDisabled();

      // The stream deadline that would have kicked in the browser-voice
      // fallback fires — but the pitch session was invalidated by the call,
      // so the fallback's fetch→speak chain bails at its session guard.
      await act(async () => {
        jest.advanceTimersByTime(2500);
        await Promise.resolve();
        await Promise.resolve();
      });
      // A late "playing" from the abandoned element is ignored too.
      await act(async () => {
        FakeAudio.instances[0].onplaying?.();
      });
      expect(speakPitchWithBrowserTts).not.toHaveBeenCalled();
      expect(screen.queryByText("Playing Introduction")).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });
});

describe("warm-up prefetch is exercised on mount, but is never a recorded play (genuine plays only)", () => {
  it("fires the range-prefetch (positive control) yet records no listen event, starts no call, and creates no audio element", async () => {
    const w = window as unknown as { requestIdleCallback?: (cb: () => void) => number };
    const realRIC = w.requestIdleCallback;
    // Run the idle warm-up synchronously so it is actually exercised HERE,
    // where the negatives are asserted. The other "on load" tests use real
    // timers + a single-microtask settle(), so the default setTimeout(warm,
    // 2500) never fires and their prefetch negatives pass without the
    // prefetch ever running — this test closes that gap.
    w.requestIdleCallback = (cb: () => void) => {
      cb();
      return 0;
    };
    try {
      window.localStorage.clear();
      window.localStorage.setItem("pagalava.language", "en");
      const fetchMock = jest.fn(() => Promise.resolve(cardResponse("en")));
      global.fetch = fetchMock as unknown as typeof fetch;
      render(<PublicBusinessCard companyId="comp-1" employeeId="emp-1" />);
      await screen.findByTestId("voice-mic-button");
      await settle();
      // Positive control: the warm-up genuinely ran its range prefetch(es).
      const prefetch = (global.fetch as jest.Mock).mock.calls.filter((c) => /\/pitch\?type=/.test(String(c[0])));
      expect(prefetch.length).toBeGreaterThan(0);
      // ...yet not one prefetch — nor anything else on load — recorded a
      // listen event, started a call, or created an audio element.
      expect(listenPosts()).toHaveLength(0);
      expect(startCall).not.toHaveBeenCalled();
      expect(FakeAudio.instances).toHaveLength(0);
    } finally {
      if (realRIC) w.requestIdleCallback = realRIC;
      else delete w.requestIdleCallback;
    }
  });
});
