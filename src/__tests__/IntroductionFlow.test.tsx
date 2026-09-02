/**
 * @jest-environment jsdom
 *
 * The recorded-introduction state machine (2026-08-19 spec), pinned
 * end-to-end at the component level:
 *
 *   INTRO_IDLE (Play) → INTRO_PLAYING ("Playing Introduction", Pause only)
 *   ⇄ INTRO_PAUSED (Resume) → INTRO_COMPLETE ("Tap to Speak")
 *   → [explicit tap] → Vapi call (the ONLY way one starts from the card).
 *
 * The non-negotiables each test guards: nothing plays on load (no autoplay,
 * no Vapi, no mic); the introduction is a plain audio asset, never an AI
 * call; "End call" and the AI statuses belong exclusively to the live
 * conversation; and English and Tamil walk the identical machine with only
 * the recorded asset differing.
 */
import "@testing-library/jest-dom";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { PublicBusinessCard } from "@/features/voice/components/PublicBusinessCard";
import taBundle from "@/features/language/locales/ta.json";
import enBundle from "@/features/language/locales/en.json";
import hiBundle from "@/features/language/locales/hi.json";
import teBundle from "@/features/language/locales/te.json";
import mlBundle from "@/features/language/locales/ml.json";
import knBundle from "@/features/language/locales/kn.json";

const startCall = jest.fn();
const endCall = jest.fn();
// Mutable so individual tests can put the mocked session into a live-call
// state; the mock returns a fresh copy each render.
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
  onplaying: (() => void) | null = null;
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(src: string) {
    this.src = src;
    FakeAudio.instances.push(this);
  }
  play() {
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

async function mountCard(lang: "en" | "ta") {
  window.localStorage.clear();
  window.localStorage.setItem("pagalava.language", lang);
  global.fetch = jest.fn(() => Promise.resolve(cardResponse(lang))) as unknown as typeof fetch;
  render(<PublicBusinessCard companyId="comp-1" employeeId="emp-1" />);
  return await screen.findByTestId("voice-mic-button");
}

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

describe("no autoplay of any kind", () => {
  it("page load creates NO audio element, starts NO Vapi call, requests NO microphone", async () => {
    await mountCard("en");
    // Settle any pending effects — nothing below may change.
    await act(async () => {
      await Promise.resolve();
    });
    expect(FakeAudio.instances).toHaveLength(0);
    expect(startCall).not.toHaveBeenCalled();
    await screen.findByText("Play Introduction"); // idle state offers Play — and nothing is playing
  });

  it("a language switch also autoplays nothing", async () => {
    await mountCard("en");
    await screen.findByText("Play Introduction");
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "தமிழ்" } });
    await act(async () => {
      await Promise.resolve();
    });
    expect(FakeAudio.instances).toHaveLength(0);
    expect(startCall).not.toHaveBeenCalled();
  });
});

describe("English introduction flow", () => {
  it("Play → 'Playing Introduction' with Pause as the ONLY control, no AI statuses, no End Call, no Vapi", async () => {
    const mic = await mountCard("en");
    await screen.findByText("Play Introduction");

    fireEvent.click(mic);
    expect(FakeAudio.instances).toHaveLength(1);
    expect(FakeAudio.instances[0].src).toContain("/pitch?type=intro&lang=en");
    await act(async () => {
      FakeAudio.instances[0].onplaying?.();
    });

    expect(screen.getByTestId("intro-state-label")).toHaveTextContent("Playing Introduction");
    expect(screen.getByTestId("intro-pause-resume")).toHaveTextContent("Pause");
    expect(screen.queryByText("End call")).toBeNull();
    expect(screen.queryByText(/Listening|Thinking|Speaking…/)).toBeNull();
    expect(startCall).not.toHaveBeenCalled();
    // The mic button is disabled while the introduction owns playback.
    expect(screen.getByTestId("voice-mic-button")).toBeDisabled();
  });

  it("Pause ⇄ Resume drives the same audio element without restarting it", async () => {
    const mic = await mountCard("en");
    await screen.findByText("Play Introduction");
    fireEvent.click(mic);
    await act(async () => {
      FakeAudio.instances[0].onplaying?.();
    });

    fireEvent.click(screen.getByTestId("intro-pause-resume"));
    expect(screen.getByTestId("intro-pause-resume")).toHaveTextContent("Resume");
    expect(FakeAudio.instances[0].paused).toBe(true);

    fireEvent.click(screen.getByTestId("intro-pause-resume"));
    expect(screen.getByTestId("intro-pause-resume")).toHaveTextContent("Pause");
    expect(FakeAudio.instances).toHaveLength(1); // resumed, never re-created
  });

  it("completion → 'Tap to Speak'; Vapi starts ONLY on the explicit tap, with the short post-intro opening", async () => {
    const mic = await mountCard("en");
    await screen.findByText("Play Introduction");
    fireEvent.click(mic);
    await act(async () => {
      FakeAudio.instances[0].onplaying?.();
    });
    await act(async () => {
      FakeAudio.instances[0].onended?.();
    });

    expect(screen.getByTestId("intro-state-label")).toHaveTextContent("Tap to Speak");
    expect(screen.queryByTestId("intro-pause-resume")).toBeNull();
    expect(startCall).not.toHaveBeenCalled(); // finishing the intro must NOT auto-start the call

    fireEvent.click(screen.getByTestId("voice-mic-button"));
    expect(startCall).toHaveBeenCalledTimes(1);
    // The recorded intro already delivered the introduction content — the
    // call opens with the approved short line instead of repeating it.
    expect(startCall.mock.calls[0][0]).toEqual({ firstMessage: "Now you can ask your questions" });
  });

  it("End Call appears ONLY once the AI conversation is live", async () => {
    window.localStorage.clear();
    window.localStorage.setItem("pagalava.language", "en");
    global.fetch = jest.fn(() => Promise.resolve(cardResponse("en"))) as unknown as typeof fetch;
    const { rerender } = render(<PublicBusinessCard companyId="comp-1" employeeId="emp-1" />);
    const mic = await screen.findByTestId("voice-mic-button");
    await screen.findByText("Play Introduction");
    fireEvent.click(mic);
    await act(async () => {
      FakeAudio.instances[0].onplaying?.();
      FakeAudio.instances[0].onended?.();
    });
    expect(screen.queryByText("End call")).toBeNull();

    // The mocked session flips to a live call — the mock hook reads
    // mockVoice fresh on every render, so an explicit rerender shows it.
    mockVoice.voiceState = "listening";
    rerender(<PublicBusinessCard companyId="comp-1" employeeId="emp-1" />);
    expect(await screen.findByText("End call")).toBeInTheDocument();
  });
});

describe("Tamil introduction flow — identical machine, Tamil asset", () => {
  it("Play → Tamil intro asset → Tamil 'Playing Introduction' → completion → Tamil 'Tap to Speak' → explicit tap starts Vapi", async () => {
    const mic = await mountCard("ta");
    await screen.findByText(taBundle.mic.playIntroduction);

    fireEvent.click(mic);
    expect(FakeAudio.instances).toHaveLength(1);
    expect(FakeAudio.instances[0].src).toContain("/pitch?type=intro&lang=ta");
    await act(async () => {
      FakeAudio.instances[0].onplaying?.();
    });
    expect(screen.getByTestId("intro-state-label")).toHaveTextContent(taBundle.status.playingIntroduction);
    expect(screen.getByTestId("intro-pause-resume")).toHaveTextContent(taBundle.buttons.pauseVoice);
    expect(startCall).not.toHaveBeenCalled();

    await act(async () => {
      FakeAudio.instances[0].onended?.();
    });
    expect(screen.getByTestId("intro-state-label")).toHaveTextContent(taBundle.mic.tapToSpeak);

    fireEvent.click(screen.getByTestId("voice-mic-button"));
    expect(startCall).toHaveBeenCalledTimes(1);
    expect(startCall.mock.calls[0][0]).toEqual({ firstMessage: taBundle.mic.nowYouCanAsk });
  });
});

describe("Replay — replays the recorded introduction, never Vapi/mic", () => {
  it("is hidden before completion (idle AND while playing) and appears only after the intro finishes", async () => {
    const mic = await mountCard("en");
    await screen.findByText("Play Introduction");
    // Idle: offered Play, no Replay yet.
    expect(screen.queryByTestId("intro-replay")).toBeNull();

    fireEvent.click(mic);
    await act(async () => {
      FakeAudio.instances[0].onplaying?.();
    });
    // Playing: Pause/Resume owns the controls, still no Replay.
    expect(screen.queryByTestId("intro-replay")).toBeNull();

    await act(async () => {
      FakeAudio.instances[0].onended?.();
    });
    // Complete: Tap to Speak + Replay, side by side.
    expect(screen.getByTestId("intro-state-label")).toHaveTextContent("Tap to Speak");
    expect(screen.getByTestId("intro-replay")).toHaveTextContent("Replay");
  });

  it("Replay re-plays the SAME cached intro asset (?type=intro), starts NO Vapi call, and shows the playing state again", async () => {
    const mic = await mountCard("en");
    await screen.findByText("Play Introduction");
    fireEvent.click(mic);
    await act(async () => {
      FakeAudio.instances[0].onplaying?.();
      FakeAudio.instances[0].onended?.();
    });
    const countAfterFirstPlay = FakeAudio.instances.length; // 1

    fireEvent.click(screen.getByTestId("intro-replay"));
    // Exactly one NEW audio element, for the same cached intro URL — not a new
    // type, and no TTS regeneration is implied (same asset the route caches).
    expect(FakeAudio.instances.length).toBe(countAfterFirstPlay + 1);
    const replayAudio = FakeAudio.instances[FakeAudio.instances.length - 1];
    expect(replayAudio.src).toContain("/pitch?type=intro&lang=en");
    expect(startCall).not.toHaveBeenCalled();

    await act(async () => {
      replayAudio.onplaying?.();
    });
    expect(screen.getByTestId("intro-state-label")).toHaveTextContent("Playing Introduction");
  });

  it("while a Replay is in progress there is no Replay control to tap again — no overlapping playback can start", async () => {
    const mic = await mountCard("en");
    await screen.findByText("Play Introduction");
    fireEvent.click(mic);
    await act(async () => {
      FakeAudio.instances[0].onplaying?.();
      FakeAudio.instances[0].onended?.();
    });
    fireEvent.click(screen.getByTestId("intro-replay"));
    await act(async () => {
      FakeAudio.instances[FakeAudio.instances.length - 1].onplaying?.();
    });
    // Replaying now: Pause/Resume owns the state, Replay is gone — so a second
    // tap cannot start a second, overlapping session.
    expect(screen.queryByTestId("intro-replay")).toBeNull();
    expect(screen.getByTestId("intro-pause-resume")).toBeInTheDocument();
    expect(startCall).not.toHaveBeenCalled();
  });

  it("works for Tamil too — Replay re-plays the Tamil intro asset without Vapi", async () => {
    const mic = await mountCard("ta");
    await screen.findByText(taBundle.mic.playIntroduction);
    fireEvent.click(mic);
    await act(async () => {
      FakeAudio.instances[0].onplaying?.();
      FakeAudio.instances[0].onended?.();
    });
    const replay = screen.getByTestId("intro-replay");
    expect(replay).toHaveTextContent(taBundle.buttons.replay);
    fireEvent.click(replay);
    const replayAudio = FakeAudio.instances[FakeAudio.instances.length - 1];
    expect(replayAudio.src).toContain("/pitch?type=intro&lang=ta");
    expect(startCall).not.toHaveBeenCalled();
  });
});

describe("Smart AI Lead Business Card — language-specific pitch item beside Why Us", () => {
  it("on an ENGLISH card, tapping it plays the English asset (lang=en) without starting Vapi", async () => {
    await mountCard("en");
    await screen.findByText("Play Introduction");
    const btn = screen.getByTestId("pitch-smart_ai_lead_business_card");
    expect(btn).toHaveTextContent("Smart AI Lead Business Card");

    fireEvent.click(btn);
    expect(FakeAudio.instances).toHaveLength(1);
    expect(FakeAudio.instances[0].src).toContain("/pitch?type=smart_ai_lead_business_card&lang=en");
    expect(FakeAudio.instances[0].src).not.toContain("lang=ta");
    expect(startCall).not.toHaveBeenCalled();
  });

  it("on a TAMIL card, tapping it plays the Tamil asset (lang=ta) without starting Vapi", async () => {
    await mountCard("ta");
    await screen.findByText(taBundle.mic.playIntroduction);
    const btn = screen.getByTestId("pitch-smart_ai_lead_business_card");
    fireEvent.click(btn);
    expect(FakeAudio.instances).toHaveLength(1);
    expect(FakeAudio.instances[0].src).toContain("/pitch?type=smart_ai_lead_business_card&lang=ta");
    expect(startCall).not.toHaveBeenCalled();
  });

  it("leaves the three existing pitch buttons present and unchanged", async () => {
    await mountCard("en");
    await screen.findByText("Play Introduction");
    expect(screen.getByTestId("pitch-elevator")).toHaveTextContent("Elevator Pitch");
    expect(screen.getByTestId("pitch-product")).toHaveTextContent("Service Pitch");
    expect(screen.getByTestId("pitch-usp")).toHaveTextContent("Why Us");
  });
});

describe("Service Pitch label", () => {
  it("every locale's visible pitch label says Service, and 'Product Pitch' is gone; the intro Play key exists everywhere", () => {
    const expected: Record<string, string> = {
      en: "Service Pitch",
      ta: "சேவை உரை",
      hi: "सेवा पिच",
      te: "సేవా పిచ్",
      ml: "സേവന പിച്ച്",
      kn: "ಸೇವಾ ಪಿಚ್",
    };
    const bundles: Record<string, { pitch: { product: string }; mic: { playIntroduction: string } }> = {
      en: enBundle,
      ta: taBundle,
      hi: hiBundle,
      te: teBundle,
      ml: mlBundle,
      kn: knBundle,
    };
    for (const [lang, label] of Object.entries(expected)) {
      const bundle = bundles[lang];
      expect(bundle.pitch.product).toBe(label);
      expect(JSON.stringify(bundle)).not.toContain("Product Pitch");
      expect(typeof bundle.mic.playIntroduction).toBe("string");
      expect(bundle.mic.playIntroduction.length).toBeGreaterThan(0);
    }
  });
});
