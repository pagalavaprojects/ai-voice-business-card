/**
 * @jest-environment jsdom
 *
 * The qualification panel must always show WHICH authored question is
 * active, and the visitor's transcript is ENGLISH-ONLY — rendered from the
 * server's recorded answers (question number + YES/NO/MAYBE + English
 * text), never from raw Tamil ASR and never invented client-side.
 */
import { render, screen, fireEvent, act } from "@testing-library/react";
import { AppointmentModal } from "@/features/voice/components/AppointmentModal";
import { TAMIL_QUALIFICATION_SET1, ALL_TAMIL_QUESTIONS, matchAuthoredTamilQuestion } from "@/features/voice/lib/qualificationScript";

const t = (key: string, vars?: Record<string, string>) => (vars?.n ? `${key}:${vars.n}` : key);
const baseProps = {
  open: true,
  onClose: jest.fn(),
  companyId: "c1",
  employeeId: "e1",
  employeeName: "Srinivasan",
  companyName: "Pagalava",
  language: "ta" as const,
  t,
};

function voiceWith(messages: Array<{ role: "assistant" | "user"; content: string }>, voiceState = "listening") {
  return { voiceState, callId: "call-1", startCall: jest.fn(), endCall: jest.fn(), messages, language: "ta" };
}

function startQualification() {
  fireEvent.click(screen.getByTestId("start-qualification"));
}

function mockStatus(payload: unknown) {
  global.fetch = jest.fn((url: RequestInfo | URL) => {
    const u = String(url);
    if (u.includes("qualification-status")) {
      return Promise.resolve({ ok: true, json: async () => payload } as Response);
    }
    return Promise.resolve({ ok: true, json: async () => ({ slots: [] }) } as Response);
  }) as never;
}

beforeEach(() => {
  mockStatus({ qualified: false, temperature: null, answers: [] });
});

afterEach(() => {
  jest.useRealTimers();
});

describe("qualification conversation UI", () => {
  it("shows the NEW Q1 (exact authored wording) immediately, before any transcript", () => {
    render(<AppointmentModal {...baseProps} voice={voiceWith([])} />);
    startQualification();
    expect(screen.getByTestId("current-question").textContent).toContain("உங்கள் வணிகத்தில் தீர்வு காண வேண்டிய குறிப்பிட்ட பிரச்சினை உள்ளதா?");
    // No answer recorded yet — the Live Transcript section has nothing to
    // show, so it stays absent rather than rendering an empty shell.
    expect(screen.queryByTestId("qual-transcript-heading")).toBeNull();
  });

  it("keeps the current question visible during listening — status says 'say your answer'", () => {
    render(<AppointmentModal {...baseProps} voice={voiceWith([], "listening")} />);
    startQualification();
    expect(screen.getByTestId("current-question").textContent).toBeTruthy();
    expect(screen.getByTestId("qual-status").textContent).toBe("appointment.stateAnswer");
  });

  it("never shows 'Preparing Voice' once the question is visible — connecting and speaking both read as AI ASKING", () => {
    for (const state of ["connecting", "speaking"]) {
      const { unmount } = render(<AppointmentModal {...baseProps} voice={voiceWith([], state)} />);
      startQualification();
      expect(screen.getByTestId("current-question").textContent).toBeTruthy();
      expect(screen.getByTestId("qual-status").textContent).toBe("appointment.stateAsking");
      expect(screen.queryByText("status.preparingVoice")).toBeNull();
      unmount();
    }
  });

  it("shows PROCESSING wording while the AI is classifying the answer", () => {
    render(<AppointmentModal {...baseProps} voice={voiceWith([], "thinking")} />);
    startQualification();
    expect(screen.getByTestId("qual-status").textContent).toBe("appointment.stateProcessing");
  });

  it("advances the displayed question when the assistant transcript matches the next authored question", () => {
    render(
      <AppointmentModal
        {...baseProps}
        voice={voiceWith([
          { role: "assistant", content: TAMIL_QUALIFICATION_SET1[0] },
          { role: "user", content: "ஆமாம், லீட்ஸ் பிரச்சனை" },
          // punctuation/whitespace drift, as real transcripts have:
          { role: "assistant", content: "  இந்தப் பிரச்சினை 3 மாதங்களுக்கு மேல் உள்ளதா  " },
        ])}
      />
    );
    startQualification();
    expect(screen.getByTestId("current-question").textContent).toContain(TAMIL_QUALIFICATION_SET1[1]);
    expect(screen.getByTestId("qual-progress").textContent).toContain("appointment.progressSet1:2");
  });

  it("NEVER renders raw Tamil ASR as the visitor transcript — English-only rule", () => {
    render(
      <AppointmentModal
        {...baseProps}
        voice={voiceWith([
          { role: "assistant", content: TAMIL_QUALIFICATION_SET1[0] },
          { role: "user", content: "ஆமாம், எங்களுக்கு லீட்ஸ் பிரச்சனை இருக்கு" },
        ])}
      />
    );
    startQualification();
    const panel = screen.getByTestId("qualification-conversation");
    expect(panel.textContent).not.toContain("ஆமாம், எங்களுக்கு லீட்ஸ் பிரச்சனை இருக்கு");
    expect(screen.queryByTestId("qual-history")).toBeNull();
  });

  it("renders the server-recorded answers as classification-only English records, and falls forward to the next question", async () => {
    jest.useFakeTimers();
    mockStatus({
      qualified: false,
      temperature: null,
      answers: [
        { n: 1, c: "YES", a: "Yes" },
        { n: 2, c: "MAYBE", a: "Maybe" },
      ],
    });
    render(<AppointmentModal {...baseProps} voice={voiceWith([{ role: "assistant", content: TAMIL_QUALIFICATION_SET1[0] }])} />);
    startQualification();
    await act(async () => {
      jest.advanceTimersByTime(3100);
      await Promise.resolve();
    });

    // The visible "Live Transcript" section updates in place, mid-call —
    // no modal close/reopen, no page reload — as soon as the poll picks up
    // newly-recorded answers.
    expect(screen.getByTestId("qual-transcript-heading")).toBeTruthy();
    const history = screen.getByTestId("qual-history");
    // Closed-ended spec: the English record is ONLY "User:" + the
    // classification — no free-text content, nothing fabricated.
    const line1 = screen.getByTestId("answer-1").textContent ?? "";
    expect(line1).toContain("User:");
    expect(line1).toContain("YES");
    expect(screen.getByTestId("answer-2").textContent).toContain("MAYBE");
    expect(history.textContent).not.toContain("Yes,"); // no sentence content ever rendered
    // Two answers recorded -> the active question falls forward to Q3 even
    // though the transcript only matched Q1.
    expect(screen.getByTestId("current-question").textContent).toContain(TAMIL_QUALIFICATION_SET1[2]);
    expect(screen.getByTestId("qual-progress").textContent).toContain("appointment.progressSet1:3");
  });

  it("shows Set-2 progress once a conversion question is active", () => {
    render(<AppointmentModal {...baseProps} voice={voiceWith([{ role: "assistant", content: ALL_TAMIL_QUESTIONS[7] }])} />);
    startQualification();
    expect(screen.getByTestId("qual-progress").textContent).toContain("appointment.progressSet2:8");
  });
});

describe("matchAuthoredTamilQuestion", () => {
  it("maps drifted transcripts back to the exact authored wording for all 16 questions", () => {
    for (const q of ALL_TAMIL_QUESTIONS) {
      expect(matchAuthoredTamilQuestion(`  ${q.replace("?", "")} `)).toBe(q);
    }
  });

  it("still matches when the closed-answer guidance is spoken after the question (every real utterance)", () => {
    for (const q of ALL_TAMIL_QUESTIONS) {
      expect(matchAuthoredTamilQuestion(`${q}\n\nஆம், இல்லை அல்லது இருந்தாலும் என பதிலளிக்கவும்.`)).toBe(q);
    }
  });

  it("returns null for non-question chatter, the bare guidance, and empty input", () => {
    expect(matchAuthoredTamilQuestion("நன்றி, அது நல்ல பதில்.")).toBeNull();
    expect(matchAuthoredTamilQuestion("ஆம், இல்லை அல்லது இருந்தாலும் என பதிலளிக்கவும்.")).toBeNull();
    expect(matchAuthoredTamilQuestion("")).toBeNull();
  });
});
