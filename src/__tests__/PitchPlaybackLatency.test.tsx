/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { PublicBusinessCard } from "@/features/voice/components/PublicBusinessCard";

/**
 * What happens between the tap and the first sound.
 *
 * Two cases matter and they are very far apart. A rendered asset starts
 * streaming almost immediately — metadata arrived 153ms after the click in
 * production. An asset that has never been rendered makes the route generate
 * it, which was measured at 21-80 seconds; nobody waits that long for a
 * button, so the browser voice has to take over instead.
 *
 * These pin that the tap never sits through generation, that a real stream is
 * never cut off in favour of the fallback, and that the fallback speaks the
 * same script rather than silence.
 */

jest.mock("@/features/voice/hooks/useVapiSession", () => ({
  useVapiSession: () => ({
    voiceState: "idle",
    isMuted: false,
    messages: [],
    durationSeconds: 0,
    error: null,
    isPlayingIntro: false,
    isDemoMode: true,
    callId: null,
    startCall: jest.fn(),
    endCall: jest.fn(),
    toggleMute: jest.fn(),
    sendUserMessage: jest.fn(() => true),
  }),
}));

const speakPitchWithBrowserTts = jest.fn<boolean, [string, string, Record<string, unknown>]>(() => true);
jest.mock("@/features/voice/lib/pitchFallback", () => ({
  speakPitchWithBrowserTts: (script: string, language: string, handlers: Record<string, unknown>) =>
    speakPitchWithBrowserTts(script, language, handlers),
  stopBrowserTts: jest.fn(),
  pauseBrowserTts: jest.fn(),
  resumeBrowserTts: jest.fn(),
}));

const CARD = {
  company: { name: "Pagalava Data Analytics", website: "https://maylaanai.com", logoUrl: null },
  employee: {
    name: "Srinivasan Kandasamy",
    designation: "Founder",
    email: "s@pagalava.com",
    phone: "+911234567890",
    officeAddress: null,
    workingHours: null,
    avatarUrl: null,
  },
  firstMessage: "Hello!",
  language: "en",
  enabledLanguages: ["ta", "en"],
};

/** Every Audio the card creates, so the test can decide when (or whether) a
 * stream arrives. */
interface FakeAudioElement {
  src: string;
  onplaying: (() => void) | null;
  onended: (() => void) | null;
  onerror: (() => void) | null;
  onloadedmetadata: (() => void) | null;
}
let audios: Array<{ src: string; el: FakeAudioElement }> = [];

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  audios = [];

  class FakeAudio {
    src: string;
    onplaying: (() => void) | null = null;
    onended: (() => void) | null = null;
    onerror: (() => void) | null = null;
    onloadedmetadata: (() => void) | null = null;
    constructor(src: string) {
      this.src = src;
      audios.push({ src, el: this as unknown as FakeAudioElement });
    }
    play() {
      return Promise.resolve();
    }
    pause() {}
  }
  (global as unknown as { Audio: unknown }).Audio = FakeAudio;

  global.fetch = jest.fn(async (url: RequestInfo | URL) => {
    const href = String(url);
    if (href.includes("format=script")) {
      return { ok: true, status: 200, json: async () => ({ script: "The authored pitch script." }) } as unknown as Response;
    }
    if (href.includes("/api/public/")) {
      return { ok: true, status: 200, json: async () => CARD } as unknown as Response;
    }
    return { ok: true, status: 200, json: async () => ({}) } as unknown as Response;
  }) as unknown as typeof fetch;

  window.localStorage.setItem("pagalava.language", "en");
});

afterEach(() => {
  jest.useRealTimers();
});

async function renderCard() {
  render(<PublicBusinessCard companyId="comp-1" employeeId="emp-1" />);
  await act(async () => {
    await Promise.resolve();
    jest.advanceTimersByTime(50);
  });
}

const playButton = (name: RegExp) => screen.getByRole("button", { name });

describe("a tap on a rendered pitch", () => {
  it("starts the recording and never falls back", async () => {
    await renderCard();

    act(() => {
      fireEvent.click(playButton(/play elevator pitch/i));
    });
    const audio = audios.find((a) => a.src.includes("type=elevator"));
    expect(audio).toBeDefined();

    // The server answers with a real stream well inside the deadline.
    act(() => {
      jest.advanceTimersByTime(200);
      audio!.el.onloadedmetadata?.();
      audio!.el.onplaying?.();
    });

    // Even long after the deadline would have passed, the browser voice is
    // never used — a genuine stream must not be interrupted.
    act(() => {
      jest.advanceTimersByTime(10_000);
    });
    expect(speakPitchWithBrowserTts).not.toHaveBeenCalled();
  });

  it("does not fetch the script when the recording plays", async () => {
    await renderCard();
    act(() => {
      fireEvent.click(playButton(/play why us/i));
    });
    const audio = audios.find((a) => a.src.includes("type=usp"));
    act(() => {
      audio!.el.onloadedmetadata?.();
      audio!.el.onplaying?.();
      jest.advanceTimersByTime(10_000);
    });

    const scriptFetches = (global.fetch as jest.Mock).mock.calls.filter((c) => String(c[0]).includes("format=script"));
    expect(scriptFetches).toHaveLength(0);
  });
});

describe("a tap on an asset that has not been rendered yet", () => {
  it("hands over to the browser voice instead of waiting for generation", async () => {
    await renderCard();

    act(() => {
      fireEvent.click(playButton(/play service pitch/i));
    });
    // No metadata: the route is generating. Nothing should be spoken yet.
    act(() => {
      jest.advanceTimersByTime(1_500);
    });
    expect(speakPitchWithBrowserTts).not.toHaveBeenCalled();

    // Past the deadline the visitor gets a voice rather than silence.
    await act(async () => {
      jest.advanceTimersByTime(1_000);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(speakPitchWithBrowserTts).toHaveBeenCalledTimes(1);
    expect(speakPitchWithBrowserTts.mock.calls[0][0]).toBe("The authored pitch script.");
  });

  it("speaks once, even though the dead element also errors later", async () => {
    await renderCard();
    act(() => {
      fireEvent.click(playButton(/play elevator pitch/i));
    });
    const audio = audios.find((a) => a.src.includes("type=elevator"));

    await act(async () => {
      jest.advanceTimersByTime(2_500);
      await Promise.resolve();
      await Promise.resolve();
    });
    act(() => {
      audio!.el.onerror?.();
      jest.advanceTimersByTime(5_000);
    });

    // Two voices talking over each other is worse than none.
    expect(speakPitchWithBrowserTts).toHaveBeenCalledTimes(1);
  });

  it("leaves the request running so the asset is rendered for next time", async () => {
    await renderCard();
    act(() => {
      fireEvent.click(playButton(/play elevator pitch/i));
    });
    const audio = audios.find((a) => a.src.includes("type=elevator"));

    await act(async () => {
      jest.advanceTimersByTime(2_500);
      await Promise.resolve();
    });

    // The element is released rather than aborted: the route finishes
    // generating and persists the result.
    expect(audio!.el.src).toContain("type=elevator");
    expect(speakPitchWithBrowserTts).toHaveBeenCalled();
  });
});
