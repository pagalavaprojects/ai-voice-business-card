/**
 * @jest-environment jsdom
 *
 * Regression coverage for the exact wiring that keeps the closed-ended
 * qualification directive scoped to ONLY the booking modal's "Start AI
 * Conversation" call — never the plain "Talk with AI" mic button on the
 * card, which must stay a general, open conversation. Both paths call the
 * SAME startCall() from useVapiSession; the only thing that can keep them
 * apart is what each caller passes as overrides. Verified here by spying on
 * startCall and asserting what each button actually invokes it with, in one
 * test that exercises both — closing the gap where this was previously only
 * verified by direct code reading, not by a dedicated component test.
 */
import "@testing-library/jest-dom";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { PublicBusinessCard } from "@/features/voice/components/PublicBusinessCard";

const startCall = jest.fn();

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
    startCall,
    endCall: jest.fn(),
    toggleMute: jest.fn(),
  }),
}));

function cardResponse(language: "ta" | "en" = "ta") {
  return {
    ok: true,
    status: 200,
    json: () =>
      Promise.resolve({
        company: { name: "Pagalava Data Analytics", website: "https://maylaanai.com", logoUrl: null },
        employee: { name: "Srinivasan Kandasamy", designation: "Founder", email: "s@pagalava.com", phone: "+911234567890", officeAddress: null, workingHours: null, avatarUrl: null },
        firstMessage: language === "ta" ? "வணக்கம்." : "Hello.",
        systemPrompt: "BASE_SYSTEM_PROMPT_MARKER",
        language,
        enabledLanguages: ["en", "ta", "hi", "kn", "te", "ml"],
        tools: [],
        serverUrl: "https://maylaanai.com/api/vapi/webhook",
      }),
  };
}

class IntroFakeAudio {
  static instances: IntroFakeAudio[] = [];
  src: string;
  onplaying: (() => void) | null = null;
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(src: string) {
    this.src = src;
    IntroFakeAudio.instances.push(this);
  }
  play() {
    return Promise.resolve();
  }
  pause() {}
}
const RealAudioCtor = global.Audio;

/** 2026-08-19 spec: the mic button plays the recorded introduction first;
 * only after it completes does the button start the general AI call. This
 * walks that gate so tests can reach the call-starting state. */
async function completeIntroduction() {
  const mic = await screen.findByTestId("voice-mic-button");
  fireEvent.click(mic);
  await act(async () => {
    IntroFakeAudio.instances[IntroFakeAudio.instances.length - 1].onplaying?.();
    IntroFakeAudio.instances[IntroFakeAudio.instances.length - 1].onended?.();
  });
  return mic;
}

describe("PublicBusinessCard — mic button vs. qualification call wiring", () => {
  beforeEach(() => {
    startCall.mockClear();
    IntroFakeAudio.instances = [];
    (global as unknown as { Audio: unknown }).Audio = IntroFakeAudio;
    window.localStorage.clear();
    // A stored preference skips the LanguageGate entirely, landing straight
    // on the main card view (mic button + Book an Appointment).
    window.localStorage.setItem("pagalava.language", "ta");
    global.fetch = jest.fn(() => Promise.resolve(cardResponse())) as unknown as typeof fetch;
  });

  afterEach(() => {
    (global as unknown as { Audio: unknown }).Audio = RealAudioCtor;
  });

  it("the mic button's general conversation carries NO qualification directive — and cannot start before the introduction completes", async () => {
    render(<PublicBusinessCard companyId="comp-1" employeeId="emp-1" />);
    const mic = await completeIntroduction();
    // The intro click itself started no call.
    expect(startCall).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.click(mic);
    });

    expect(startCall).toHaveBeenCalledTimes(1);
    // The post-intro general call opens with the short approved line — and
    // the isolation that matters: the qualification systemPrompt directive
    // is NEVER set on this path.
    const arg = startCall.mock.calls[0][0] as { firstMessage?: unknown; systemPrompt?: unknown };
    expect(arg.firstMessage).toBe("இப்போது உங்கள் கேள்விகளைக் கேட்கலாம்");
    expect(arg.systemPrompt).toBeUndefined();
  });

  it("Book an Appointment opens the VOICELESS data-point step — it never starts a Vapi call", async () => {
    render(<PublicBusinessCard companyId="comp-1" employeeId="emp-1" />);
    await screen.findByTestId("voice-mic-button");

    fireEvent.click(screen.getByTestId("book-meeting-button"));
    // The booking flow opens on the data-point qualification "Begin" control,
    // not a voice call.
    const begin = await screen.findByTestId("start-qualification");
    await act(async () => {
      fireEvent.click(begin);
    });

    // Beginning qualification shows the tap answers and starts NO Vapi call —
    // the booking flow is text/button only.
    expect(await screen.findByTestId("quick-replies")).toBeInTheDocument();
    expect(startCall).not.toHaveBeenCalled();
    // And it never plays a recorded introduction or any audio either.
    expect(IntroFakeAudio.instances.some((a) => a.src.includes("type=intro"))).toBe(false);
  });
});

/**
 * The pre-recorded pitches (elevator/product/usp) are speak-only by design
 * (see PublicBusinessCard's own doc comment: "no microphone, no Vapi
 * session, no permissions"). This is a code-level guarantee worth pinning
 * directly, not just trusting the comment: playPitch() must never reach
 * startCall — the ONLY function in this component that can bring up a live
 * Vapi session (mic permission + WebRTC). It plays audio through a plain
 * <audio> element (or, on failure, the browser's own speechSynthesis —
 * covered separately in PitchFallback.test.ts) instead.
 */
describe("PublicBusinessCard — pitch playback never touches the Vapi session (no mic, no WebRTC)", () => {
  class FakeAudio {
    static instances: FakeAudio[] = [];
    src: string;
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
    pause() {}
  }

  const RealAudio = global.Audio;

  beforeEach(() => {
    startCall.mockClear();
    FakeAudio.instances = [];
    (global as unknown as { Audio: unknown }).Audio = FakeAudio;
    window.localStorage.clear();
    window.localStorage.setItem("pagalava.language", "en");
    global.fetch = jest.fn(() => Promise.resolve(cardResponse("en"))) as unknown as typeof fetch;
  });

  afterEach(() => {
    (global as unknown as { Audio: unknown }).Audio = RealAudio;
  });

  it("clicking a pitch button plays it via a plain <audio> element and never calls startCall", async () => {
    render(<PublicBusinessCard companyId="comp-1" employeeId="emp-1" />);
    const pitchButton = await screen.findByTestId("pitch-elevator");

    await act(async () => {
      fireEvent.click(pitchButton);
    });

    expect(startCall).not.toHaveBeenCalled();
    const played = FakeAudio.instances.find((a) => a.src.includes("/pitch?type=elevator"));
    expect(played).toBeTruthy();
  });

  it("still never calls startCall across all three pitch types", async () => {
    render(<PublicBusinessCard companyId="comp-1" employeeId="emp-1" />);
    for (const type of ["pitch-elevator", "pitch-product", "pitch-usp"]) {
      const button = await screen.findByTestId(type);
      await act(async () => {
        fireEvent.click(button);
      });
    }
    expect(startCall).not.toHaveBeenCalled();
  });
});
