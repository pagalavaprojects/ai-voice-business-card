/**
 * @jest-environment jsdom
 *
 * The qualification panel must always show WHICH authored question is
 * active, and the visitor's transcript is classification-only — rendered
 * from the server's recorded answers (question number + YES/NO/MAYBE),
 * never from raw ASR and never invented client-side. The qualification
 * script is English-only and single-source (2026-08-13 revision) — there
 * is no Tamil qualification branch anymore.
 */
import { render, screen, fireEvent, act } from "@testing-library/react";
import { AppointmentModal } from "@/features/voice/components/AppointmentModal";
import { QUALIFICATION_QUESTIONS, ALL_QUESTIONS, matchAuthoredQuestion } from "@/features/voice/lib/qualificationScript";

const t = (key: string, vars?: Record<string, string>) => (vars ? `${key}:${Object.values(vars).join("/")}` : key);
const baseProps = {
  open: true,
  onClose: jest.fn(),
  companyId: "c1",
  employeeId: "e1",
  employeeName: "Srinivasan",
  companyName: "Pagalava",
  language: "en" as const,
  t,
};

function voiceWith(messages: Array<{ role: "assistant" | "user"; content: string }>, voiceState = "listening") {
  return { voiceState, callId: "call-1", startCall: jest.fn(), endCall: jest.fn(), messages };
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
  mockStatus({ qualified: false, answers: [] });
});

afterEach(() => {
  jest.useRealTimers();
});

describe("qualification conversation UI", () => {
  it("shows Q1 (exact authored wording) immediately, before any transcript", () => {
    render(<AppointmentModal {...baseProps} voice={voiceWith([])} />);
    startQualification();
    expect(screen.getByTestId("current-question").textContent).toContain("Is our service or product something you need immediately?");
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
          { role: "assistant", content: QUALIFICATION_QUESTIONS[0].question },
          { role: "user", content: "Yeah, we need it now" },
          // punctuation/whitespace drift, as real transcripts have:
          { role: "assistant", content: "  Have you set aside a specific budget for this already  " },
        ])}
      />
    );
    startQualification();
    expect(screen.getByTestId("current-question").textContent).toContain(QUALIFICATION_QUESTIONS[1].question);
    expect(screen.getByTestId("qual-progress").textContent).toBe("appointment.qualifyProgress:2/6");
  });

  it("an invalid answer keeps Q1 active: the server's reprompt (bare guidance, no new question) never advances the question area", () => {
    // Simulates a real reprompt cycle: the visitor's reply couldn't be
    // classified, so the model spoke ONLY the guidance line again (never a
    // new authored question) and NOTHING was recorded server-side
    // (qualAnswers stays empty, per the default mockStatus in beforeEach).
    // matchAuthoredQuestion correctly returns null for a bare guidance
    // utterance, so the backward scan skips it and keeps resolving to Q1 —
    // the last message that actually matched an authored question.
    render(
      <AppointmentModal
        {...baseProps}
        voice={voiceWith([
          { role: "assistant", content: QUALIFICATION_QUESTIONS[0].question },
          { role: "user", content: "yes we need it" }, // invalid — a sentence, not the closed word
          { role: "assistant", content: "Please answer with Yes, No, or Maybe." }, // reprompt: guidance only
        ])}
      />
    );
    startQualification();
    expect(screen.getByTestId("current-question").textContent).toContain(QUALIFICATION_QUESTIONS[0].question);
    expect(screen.getByTestId("qual-progress").textContent).toBe("appointment.qualifyProgress:1/6");
    // Nothing was accepted, so there is nothing to show yet.
    expect(screen.queryByTestId("qual-transcript-heading")).toBeNull();
    expect(screen.queryByTestId("qual-history")).toBeNull();
  });

  // Regression: the qualification-status poll fires every 3s with no
  // sequencing between ticks. Real network timing does not guarantee
  // responses resolve in the order they were requested — a slower EARLIER
  // request resolving after a faster LATER one previously overwrote
  // qualAnswers with stale (older) data, visibly regressing the displayed
  // question/progress even though the server's actual state only ever
  // moved forward. This is the class of bug behind "the flow doesn't
  // reliably progress" reports where the underlying voice conversation and
  // persistence were both actually fine.
  it("a slower earlier poll response arriving after a faster later one does not regress the displayed progress", async () => {
    jest.useFakeTimers();
    const resolvers: Array<(payload: unknown) => void> = [];
    global.fetch = jest.fn((url: RequestInfo | URL) => {
      const u = String(url);
      if (u.includes("qualification-status")) {
        return new Promise((resolve) => {
          resolvers.push((payload) => resolve({ ok: true, json: async () => payload } as Response));
        });
      }
      return Promise.resolve({ ok: true, json: async () => ({ slots: [] }) } as Response);
    }) as never;

    render(
      <AppointmentModal {...baseProps} voice={voiceWith([{ role: "assistant", content: QUALIFICATION_QUESTIONS[0].question }])} />
    );
    startQualification();

    // Tick 1 issues request #1, left unresolved (simulating a slow response).
    await act(async () => {
      jest.advanceTimersByTime(3100);
    });
    expect(resolvers).toHaveLength(1);

    // Tick 2 issues request #2 before request #1 has resolved.
    await act(async () => {
      jest.advanceTimersByTime(3000);
    });
    expect(resolvers).toHaveLength(2);

    // Request #2 (newer) resolves FIRST, with real progress recorded.
    await act(async () => {
      resolvers[1]({ qualified: false, answers: [{ n: 1, c: "YES", a: "Yes" }, { n: 2, c: "NO", a: "No" }] });
      await Promise.resolve();
    });
    expect(screen.getByTestId("qual-progress").textContent).toBe("appointment.qualifyProgress:3/6");

    // Request #1 (older, stale) resolves SECOND, with empty answers — must
    // be discarded rather than regressing the display back to Q1.
    await act(async () => {
      resolvers[0]({ qualified: false, answers: [] });
      await Promise.resolve();
    });
    expect(screen.getByTestId("qual-progress").textContent).toBe("appointment.qualifyProgress:3/6");
  });

  // The answers array is complete and frozen the moment qualified:true
  // comes back — Q6's completion routes straight to booking, never back
  // through get_next_qualification_question — so continuing to poll after
  // that point can never learn anything new. It only wastes a request every
  // 3s until the visitor gets around to clicking Continue.
  it("stops polling qualification-status once qualified:true is received — no wasted requests after completion", async () => {
    jest.useFakeTimers();
    mockStatus({ qualified: true, answers: [{ n: 6, c: "YES", a: "Yes" }] });
    render(<AppointmentModal {...baseProps} voice={voiceWith([{ role: "assistant", content: QUALIFICATION_QUESTIONS[5].question }])} />);
    startQualification();

    await act(async () => {
      jest.advanceTimersByTime(3100);
      await Promise.resolve();
    });
    const statusCallsAfterCompletion = (global.fetch as jest.Mock).mock.calls.filter((c) => String(c[0]).includes("qualification-status")).length;
    expect(statusCallsAfterCompletion).toBe(1);
    expect(screen.getByTestId("qualification-continue")).toBeTruthy();

    // Further ticks must not issue any additional qualification-status request.
    await act(async () => {
      jest.advanceTimersByTime(9000);
      await Promise.resolve();
    });
    const statusCallsAfterMoreTicks = (global.fetch as jest.Mock).mock.calls.filter((c) => String(c[0]).includes("qualification-status")).length;
    expect(statusCallsAfterMoreTicks).toBe(1);
  });

  it("NEVER renders raw free-text visitor speech as the transcript — classification-only rule", () => {
    render(
      <AppointmentModal
        {...baseProps}
        voice={voiceWith([
          { role: "assistant", content: QUALIFICATION_QUESTIONS[0].question },
          { role: "user", content: "Yeah, we definitely need this immediately" },
        ])}
      />
    );
    startQualification();
    const panel = screen.getByTestId("qualification-conversation");
    expect(panel.textContent).not.toContain("Yeah, we definitely need this immediately");
    expect(screen.queryByTestId("qual-history")).toBeNull();
  });

  it("renders the server-recorded answers as classification-only records, and falls forward to the next question", async () => {
    jest.useFakeTimers();
    mockStatus({
      qualified: false,
      answers: [
        { n: 1, c: "YES", a: "Yes" },
        { n: 2, c: "MAYBE", a: "Maybe" },
      ],
    });
    render(<AppointmentModal {...baseProps} voice={voiceWith([{ role: "assistant", content: QUALIFICATION_QUESTIONS[0].question }])} />);
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
    // Closed-ended spec: the record is ONLY "User:" + the classification —
    // no free-text content, nothing fabricated.
    const line1 = screen.getByTestId("answer-1").textContent ?? "";
    expect(line1).toContain("User:");
    expect(line1).toContain("YES");
    expect(screen.getByTestId("answer-2").textContent).toContain("MAYBE");
    expect(history.textContent).not.toContain("Yes,"); // no sentence content ever rendered
    // Two answers recorded -> the active question falls forward to Q3 even
    // though the transcript only matched Q1.
    expect(screen.getByTestId("current-question").textContent).toContain(QUALIFICATION_QUESTIONS[2].question);
    expect(screen.getByTestId("qual-progress").textContent).toBe("appointment.qualifyProgress:3/6");
  });

  it("full end-to-end walk: all six answers render as classification-only records, in order, with the question area always on the correct next question", async () => {
    jest.useFakeTimers();
    // Every one of the three canonical answers appears at least once, and
    // the server-recorded order (not insertion order into some other
    // structure) is what the transcript must reflect.
    const classifications = ["YES", "NO", "MAYBE", "YES", "NO", "MAYBE"] as const;
    mockStatus({
      qualified: true,
      answers: classifications.map((c, i) => ({ n: i + 1, c, a: c === "YES" ? "Yes" : c === "NO" ? "No" : "Maybe" })),
    });
    render(<AppointmentModal {...baseProps} voice={voiceWith([{ role: "assistant", content: QUALIFICATION_QUESTIONS[0].question }])} />);
    startQualification();
    await act(async () => {
      jest.advanceTimersByTime(3100);
      await Promise.resolve();
    });

    // Live Transcript: exactly 6 entries, correct classification each, in
    // authored-question order. Each ANSWER line (the "User:" line, not the
    // authored question label shown above it for context) is
    // classification-only: never a free-text sentence.
    const history = screen.getByTestId("qual-history");
    classifications.forEach((c, i) => {
      const line = screen.getByTestId(`answer-${i + 1}`).textContent ?? "";
      expect(line).toContain("User:");
      expect(line).toContain(c);
      expect(line).not.toMatch(/Yes,|No,|Maybe,/); // no free-text sentence content
    });
    expect(history.textContent).not.toMatch(/Yes,|No,|Maybe,/);

    // All six questions answered — Continue must now be genuinely visible.
    expect(screen.getByTestId("qualification-continue")).toBeTruthy();
  });

  it("Continue is absent until qualification genuinely completes, and never depends on lead scoring", () => {
    render(<AppointmentModal {...baseProps} voice={voiceWith([{ role: "assistant", content: QUALIFICATION_QUESTIONS[0].question }])} />);
    startQualification();
    expect(screen.queryByTestId("qualification-continue")).toBeNull();
  });

  // Regression guard: `step` (which panel renders — qualification vs. slot
  // selection) only ever changes inside advanceToSlots(), which is wired
  // exclusively to the Continue and Skip button clicks. Nothing in the
  // qualification-status poll effect sets step itself, so genuine
  // completion (qualComplete becoming true) must reveal the Continue
  // button WITHOUT silently jumping the visitor into slot selection first —
  // that transition is the visitor's own explicit action, never automatic.
  it("qualification completing does NOT auto-open slot selection — the visitor must explicitly click Continue", async () => {
    jest.useFakeTimers();
    const classifications = ["YES", "NO", "MAYBE", "YES", "NO", "MAYBE"] as const;
    mockStatus({
      qualified: true,
      answers: classifications.map((c, i) => ({ n: i + 1, c, a: c === "YES" ? "Yes" : c === "NO" ? "No" : "Maybe" })),
    });
    render(<AppointmentModal {...baseProps} voice={voiceWith([{ role: "assistant", content: QUALIFICATION_QUESTIONS[0].question }])} />);
    startQualification();
    await act(async () => {
      jest.advanceTimersByTime(3100);
      await Promise.resolve();
    });

    // Completion is visible (Continue exists)...
    expect(screen.getByTestId("qualification-continue")).toBeTruthy();
    // ...but the modal is still on the qualification step: no slot-picker
    // copy or calendar UI has appeared on its own.
    expect(screen.getByTestId("qualification-conversation")).toBeTruthy();
    expect(screen.queryByText("appointment.chooseSlotTitle")).toBeNull();
    expect(screen.queryByText("appointment.loadingSlots")).toBeNull();
  });
});

describe("matchAuthoredQuestion", () => {
  it("maps drifted transcripts back to the exact authored wording for all six questions", () => {
    for (const q of ALL_QUESTIONS) {
      expect(matchAuthoredQuestion(`  ${q.replace("?", "")} `)).toBe(q);
    }
  });

  it("still matches when the closed-answer guidance is spoken after the question (every real utterance)", () => {
    for (const q of ALL_QUESTIONS) {
      expect(matchAuthoredQuestion(`${q}\n\nPlease answer with Yes, No, or Maybe.`)).toBe(q);
    }
  });

  it("returns null for non-question chatter, the bare guidance, and empty input", () => {
    expect(matchAuthoredQuestion("Thanks, that's a great answer.")).toBeNull();
    expect(matchAuthoredQuestion("Please answer with Yes, No, or Maybe.")).toBeNull();
    expect(matchAuthoredQuestion("")).toBeNull();
  });
});
