/**
 * @jest-environment jsdom
 *
 * Regression: when the pitch audio fails to load (e.g. the API 503s because
 * TTS rendering is unavailable upstream), the <audio> element fires its
 * onerror handler AND the play() promise rejects — two callbacks for the
 * same single failure. The browser-TTS fallback must run exactly ONCE per
 * pitch click: running it twice fetched the script twice and spoke twice,
 * with the second speak cancel()ing the first, whose "canceled" event then
 * raced the second's onstart and could clear the playing state while audio
 * was still audibly speaking (observed live as two identical
 * ?format=script requests per pitch click in production).
 */
import "@testing-library/jest-dom";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";
import { PublicBusinessCard } from "@/features/voice/components/PublicBusinessCard";

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
  }),
}));

function cardResponse() {
  return {
    ok: true,
    status: 200,
    json: () =>
      Promise.resolve({
        company: { name: "Pagalava Data Analytics", website: "https://maylaanai.com", logoUrl: null },
        employee: { name: "Srinivasan Kandasamy", designation: "Founder", email: "s@pagalava.com", phone: "+911234567890", officeAddress: null, workingHours: null, avatarUrl: null },
        firstMessage: "Hello.",
        systemPrompt: "BASE",
        language: "en",
        enabledLanguages: ["en", "ta", "hi", "kn", "te", "ml"],
        tools: [],
        serverUrl: "https://maylaanai.com/api/vapi/webhook",
      }),
  };
}

/** Fails the way a real 503-backed <audio> does: the element errors AND the
 * play() promise rejects — both callbacks fire for one failed load. */
class DoubleFailingAudio {
  static instances: DoubleFailingAudio[] = [];
  src: string;
  onplaying: (() => void) | null = null;
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(src: string) {
    this.src = src;
    DoubleFailingAudio.instances.push(this);
  }
  play() {
    queueMicrotask(() => this.onerror?.());
    return Promise.reject(new Error("NotSupportedError"));
  }
  pause() {}
}

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

describe("PublicBusinessCard — pitch audio failure runs the browser-TTS fallback exactly once", () => {
  const RealAudio = global.Audio;
  let speak: jest.Mock;
  let fetchMock: jest.Mock;

  const scriptFetchCount = () =>
    fetchMock.mock.calls.filter(([url]) => String(url).includes("format=script")).length;

  beforeEach(() => {
    DoubleFailingAudio.instances = [];
    (global as unknown as { Audio: unknown }).Audio = DoubleFailingAudio;
    speak = jest.fn();
    Object.defineProperty(window, "speechSynthesis", {
      configurable: true,
      value: { speak, cancel: jest.fn(), speaking: false, paused: false },
    });
    (globalThis as Record<string, unknown>).SpeechSynthesisUtterance = FakeUtterance;
    window.localStorage.clear();
    window.localStorage.setItem("pagalava.language", "en");
    fetchMock = jest.fn((url: string) =>
      String(url).includes("format=script")
        ? Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ script: "Hello from the fallback.", language: "en" }) })
        : Promise.resolve(cardResponse())
    );
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    (global as unknown as { Audio: unknown }).Audio = RealAudio;
    delete (globalThis as Record<string, unknown>).SpeechSynthesisUtterance;
  });

  it("fetches the script and speaks exactly once even though onerror AND the play() rejection both fire", async () => {
    render(<PublicBusinessCard companyId="comp-1" employeeId="emp-1" />);
    const pitchButton = await screen.findByTestId("pitch-elevator");

    await act(async () => {
      fireEvent.click(pitchButton);
    });

    await waitFor(() => expect(scriptFetchCount()).toBe(1));
    // Let any straggling second fallback (the bug) get its chance to fire
    // before pinning the final counts.
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(scriptFetchCount()).toBe(1);
    expect(speak).toHaveBeenCalledTimes(1);
    expect((speak.mock.calls[0][0] as FakeUtterance).text).toBe("Hello from the fallback.");
  });

  it("a SECOND click on a different pitch still gets its own single fallback — the guard is per-click, not per-mount", async () => {
    render(<PublicBusinessCard companyId="comp-1" employeeId="emp-1" />);
    const elevator = await screen.findByTestId("pitch-elevator");
    await act(async () => {
      fireEvent.click(elevator);
    });
    await waitFor(() => expect(scriptFetchCount()).toBe(1));

    const product = await screen.findByTestId("pitch-product");
    await act(async () => {
      fireEvent.click(product);
    });
    await waitFor(() => expect(scriptFetchCount()).toBe(2));

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(scriptFetchCount()).toBe(2);
    expect(speak).toHaveBeenCalledTimes(2);
  });
});

/** Load stays PENDING until the test settles it — the shape of a cold-cache
 * server TTS render, where play() can hang for seconds. pause() rejects the
 * pending play() promise with AbortError exactly as the HTML spec requires,
 * which is the trigger for the supersede/cancel races below. */
class PendingAudio {
  static instances: PendingAudio[] = [];
  src: string;
  onplaying: (() => void) | null = null;
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  pauseCalls = 0;
  private rejectPlay: ((e: Error) => void) | null = null;
  constructor(src: string) {
    this.src = src;
    PendingAudio.instances.push(this);
  }
  play() {
    return new Promise<void>((_resolve, reject) => {
      this.rejectPlay = reject;
    });
  }
  pause() {
    this.pauseCalls++;
    const reject = this.rejectPlay;
    this.rejectPlay = null;
    if (reject) reject(Object.assign(new Error("The play() request was interrupted by a call to pause()."), { name: "AbortError" }));
  }
  /** A real load failure (e.g. the API 503s): element error + play() rejection. */
  failLoad() {
    this.onerror?.();
    const reject = this.rejectPlay;
    this.rejectPlay = null;
    if (reject) reject(Object.assign(new Error("The element has no supported sources."), { name: "NotSupportedError" }));
  }
}

describe("PublicBusinessCard — superseded/cancelled pitches never resurrect through the fallback", () => {
  const RealAudio = global.Audio;
  let speak: jest.Mock;
  let fetchMock: jest.Mock;

  const scriptFetches = () => fetchMock.mock.calls.map(([u]) => String(u)).filter((u) => u.includes("format=script"));

  beforeEach(() => {
    PendingAudio.instances = [];
    (global as unknown as { Audio: unknown }).Audio = PendingAudio;
    speak = jest.fn();
    Object.defineProperty(window, "speechSynthesis", {
      configurable: true,
      value: { speak, cancel: jest.fn(), speaking: false, paused: false },
    });
    (globalThis as Record<string, unknown>).SpeechSynthesisUtterance = FakeUtterance;
    window.localStorage.clear();
    window.localStorage.setItem("pagalava.language", "en");
    fetchMock = jest.fn((url: string) => {
      const u = String(url);
      if (u.includes("format=script")) {
        const type = (u.match(/type=(\w+)/) ?? [])[1] ?? "unknown";
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ script: `SCRIPT:${type}`, language: "en" }) });
      }
      return Promise.resolve(cardResponse());
    });
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    (global as unknown as { Audio: unknown }).Audio = RealAudio;
    delete (globalThis as Record<string, unknown>).SpeechSynthesisUtterance;
  });

  it("switching pitches while the first is still loading must not voice the abandoned pitch — only the new pitch's fallback runs", async () => {
    render(<PublicBusinessCard companyId="comp-1" employeeId="emp-1" />);
    const elevator = await screen.findByTestId("pitch-elevator");

    await act(async () => {
      fireEvent.click(elevator);
    });
    const elevatorAudio = PendingAudio.instances.find((a) => a.src.includes("type=elevator"))!;
    expect(elevatorAudio).toBeTruthy();

    // Switch while the elevator's play() is still pending. stopPitch()
    // pauses it, which rejects its play() promise with AbortError — the
    // exact callback that previously fetched and SPOKE the abandoned
    // elevator pitch over the product one.
    await act(async () => {
      fireEvent.click(screen.getByTestId("pitch-product"));
    });
    expect(elevatorAudio.pauseCalls).toBeGreaterThanOrEqual(1);

    const productAudio = PendingAudio.instances.find((a) => a.src.includes("type=product"))!;
    expect(productAudio).toBeTruthy();
    await act(async () => {
      productAudio.failLoad();
    });
    await waitFor(() => expect(scriptFetches().length).toBe(1));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(scriptFetches()).toHaveLength(1);
    expect(scriptFetches()[0]).toContain("type=product");
    expect(speak).toHaveBeenCalledTimes(1);
    expect((speak.mock.calls[0][0] as FakeUtterance).text).toBe("SCRIPT:product");
  });

  it("cancelling a still-loading pitch (second tap) stays cancelled — no fallback fetch, nothing spoken", async () => {
    render(<PublicBusinessCard companyId="comp-1" employeeId="emp-1" />);
    const elevator = await screen.findByTestId("pitch-elevator");

    await act(async () => {
      fireEvent.click(elevator);
    });
    // Second tap while loading = cancel (playPitch's pitchLoading branch).
    await act(async () => {
      fireEvent.click(elevator);
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(scriptFetches()).toHaveLength(0);
    expect(speak).not.toHaveBeenCalled();
  });
});

/** Resolves play() immediately — the warm-cache happy path — so the
 * pause/resume toggle can be exercised against a genuinely playing pitch. */
class PlayableAudio {
  static instances: PlayableAudio[] = [];
  src: string;
  onplaying: (() => void) | null = null;
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  playCalls = 0;
  pauseCalls = 0;
  constructor(src: string) {
    this.src = src;
    PlayableAudio.instances.push(this);
  }
  play() {
    this.playCalls++;
    return Promise.resolve();
  }
  pause() {
    this.pauseCalls++;
  }
}

describe("PublicBusinessCard — pitch Pause/Resume drives the audio element, not a stop-and-restart", () => {
  const RealAudio = global.Audio;

  beforeEach(() => {
    PlayableAudio.instances = [];
    (global as unknown as { Audio: unknown }).Audio = PlayableAudio;
    window.localStorage.clear();
    window.localStorage.setItem("pagalava.language", "en");
    global.fetch = jest.fn(() => Promise.resolve(cardResponse())) as unknown as typeof fetch;
  });

  afterEach(() => {
    (global as unknown as { Audio: unknown }).Audio = RealAudio;
  });

  it("tapping the playing pitch pauses it; tapping again resumes the SAME audio element", async () => {
    render(<PublicBusinessCard companyId="comp-1" employeeId="emp-1" />);
    const elevator = await screen.findByTestId("pitch-elevator");

    await act(async () => {
      fireEvent.click(elevator);
    });
    const audio = PlayableAudio.instances.find((a) => a.src.includes("type=elevator"))!;
    await act(async () => {
      audio.onplaying?.();
    });
    expect(elevator).toHaveAttribute("aria-pressed", "true");

    // Pause: same element, no new Audio, no stop.
    await act(async () => {
      fireEvent.click(elevator);
    });
    expect(audio.pauseCalls).toBe(1);

    // Resume: play() again on the SAME element — currentTime is preserved
    // by the browser, which is the whole point of pause vs stop.
    const instancesBefore = PlayableAudio.instances.length;
    await act(async () => {
      fireEvent.click(elevator);
    });
    expect(audio.playCalls).toBe(2);
    expect(PlayableAudio.instances.length).toBe(instancesBefore);
  });
});
