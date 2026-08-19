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
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { PublicBusinessCard } from "@/features/voice/components/PublicBusinessCard";
import { QUALIFICATION_CALL_OPENING, getQualificationCallOpening } from "@/features/voice/lib/qualificationScript";

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

describe("PublicBusinessCard — mic button vs. qualification call wiring", () => {
  beforeEach(() => {
    startCall.mockClear();
    window.localStorage.clear();
    // A stored preference skips the LanguageGate entirely, landing straight
    // on the main card view (mic button + Book an Appointment).
    window.localStorage.setItem("pagalava.language", "ta");
    global.fetch = jest.fn(() => Promise.resolve(cardResponse())) as unknown as typeof fetch;
  });

  it("the plain mic button calls startCall with NO qualification overrides — general conversation, no closed-ended directive", async () => {
    render(<PublicBusinessCard companyId="comp-1" employeeId="emp-1" />);
    const mic = await screen.findByTestId("voice-mic-button");

    await act(async () => {
      fireEvent.click(mic);
    });

    expect(startCall).toHaveBeenCalledTimes(1);
    // The button binds startCall directly as its onClick handler, so the
    // DOM click event is what actually lands in the "overrides" parameter —
    // what matters is neither qualification field is ever set on it.
    const arg = startCall.mock.calls[0][0] as { firstMessage?: unknown; systemPrompt?: unknown } | undefined;
    expect(arg?.firstMessage).toBeUndefined();
    expect(arg?.systemPrompt).toBeUndefined();
  });

  it("a TAMIL card starts qualification with the TAMIL Q1 opening AND the Tamil directive — never leaking into the plain mic path", async () => {
    render(<PublicBusinessCard companyId="comp-1" employeeId="emp-1" />);
    await screen.findByTestId("voice-mic-button");

    fireEvent.click(screen.getByTestId("book-meeting-button"));
    const startQualification = await screen.findByTestId("start-qualification");

    await act(async () => {
      fireEvent.click(startQualification);
    });

    expect(startCall).toHaveBeenCalledTimes(1);
    const [overrides] = startCall.mock.calls[0] as [{ firstMessage: string; systemPrompt: string }];
    // baseProps store 'ta' — the 2026-08-19 decision: qualification
    // language follows the selected card language.
    expect(overrides.firstMessage).toBe(getQualificationCallOpening("ta"));
    expect(overrides.firstMessage).toContain("எங்கள் சேவை அல்லது தயாரிப்பு உங்களுக்கு உடனடியாகத் தேவைப்படுகிறதா?");
    expect(overrides.firstMessage).not.toContain("Is our service or product");
    expect(overrides.systemPrompt).toContain("BASE_SYSTEM_PROMPT_MARKER");
    expect(overrides.systemPrompt).toContain("STRICT CLOSED-ENDED questionnaire");
    expect(overrides.systemPrompt).toContain("TAMIL ONLY");

    // The plain mic button, untouched by the modal interaction above, must
    // still be wired with no qualification overrides if used afterward.
    startCall.mockClear();
    await act(async () => {
      fireEvent.click(screen.getByTestId("voice-mic-button"));
    });
    const micArg = startCall.mock.calls[0][0] as { firstMessage?: unknown; systemPrompt?: unknown } | undefined;
    expect(micArg?.firstMessage).toBeUndefined();
    expect(micArg?.systemPrompt).toBeUndefined();
  });

  it("an ENGLISH card starts qualification with the ENGLISH Q1 opening and directive — no Tamil leaks into it", async () => {
    window.localStorage.setItem("pagalava.language", "en");
    global.fetch = jest.fn(() => Promise.resolve(cardResponse("en"))) as unknown as typeof fetch;

    render(<PublicBusinessCard companyId="comp-1" employeeId="emp-1" />);
    await screen.findByTestId("voice-mic-button");

    fireEvent.click(screen.getByTestId("book-meeting-button"));
    const startQualification = await screen.findByTestId("start-qualification");
    await act(async () => {
      fireEvent.click(startQualification);
    });

    expect(startCall).toHaveBeenCalledTimes(1);
    const [overrides] = startCall.mock.calls[0] as [{ firstMessage: string; systemPrompt: string }];
    expect(overrides.firstMessage).toBe(QUALIFICATION_CALL_OPENING);
    expect(overrides.firstMessage).toBe("Is our service or product something you need immediately?\n\nPlease answer with Yes, No, or Maybe.");
    expect(overrides.systemPrompt).toContain("BASE_SYSTEM_PROMPT_MARKER");
    expect(overrides.systemPrompt).toContain("STRICT CLOSED-ENDED questionnaire");
    expect(overrides.systemPrompt).not.toMatch(/[஀-௿]/); // no Tamil script anywhere in the ENGLISH qualification directive
    // And the English opening is never the generic greeting.
    expect(overrides.firstMessage).not.toMatch(/how can i help/i);
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
