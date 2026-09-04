/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";
import { AppointmentModal } from "@/features/voice/components/AppointmentModal";
import { ALL_QUESTIONS, getQualificationQuestions, matchAuthoredQuestion } from "@/features/voice/lib/qualificationScript";

/**
 * The voiceless six-data-point qualification UI: one authoritative data point
 * on screen at a time (exact authored wording), three tap answers, and a
 * strictly server-driven advance. No microphone, no Vapi, no spoken question
 * or answer — the terminology is "Data Points", not "Questions".
 */

const t = (key: string, vars?: Record<string, string>) => (vars ? `${key}:${Object.values(vars).join("/")}` : key);
const classOf = (label: string): "YES" | "NO" | "MAYBE" =>
  label === "Yes" || label === "ஆம்" ? "YES" : label === "No" || label === "இல்லை" ? "NO" : "MAYBE";

function installFetchMock(slots: Array<{ time: string }> = [{ time: "2027-01-01T09:00:00.000Z" }]) {
  const recorded: Array<{ n: number; c: string; a: string }> = [];
  global.fetch = jest.fn(async (url: string, init?: RequestInit) => {
    const u = String(url);
    if (u.includes("/qualification-status") && init?.method === "POST") {
      const body = JSON.parse(String(init.body));
      if (!recorded.some((a) => a.n === body.questionNumber)) recorded.push({ n: body.questionNumber, c: classOf(body.answer), a: body.answer });
      return { ok: true, status: 200, json: async () => ({ answers: [...recorded], qualified: recorded.some((a) => a.n === 6), accepted: true }) };
    }
    return { ok: true, status: 200, json: async () => ({ configured: true, slots }) };
  }) as unknown as typeof fetch;
  return { recorded };
}

function props(language: "en" | "ta" = "en") {
  return { open: true, onClose: jest.fn(), companyId: "comp-1", employeeId: "emp-1", employeeName: "Srinivasan Kandasamy", companyName: "Pagalava", language: language as never, t, qualifyFirst: true };
}
async function begin(language: "en" | "ta" = "en") {
  const r = render(<AppointmentModal {...props(language)} />);
  await act(async () => {
    fireEvent.click(screen.getByTestId("start-qualification"));
  });
  return r;
}
async function answerThrough(n: number) {
  for (let i = 1; i <= n; i++) {
    await waitFor(() => expect(screen.getByTestId("quick-replies")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("quick-reply-yes"));
  }
}

beforeEach(() => {
  jest.clearAllMocks();
  installFetchMock();
});

describe("voiceless qualification UI", () => {
  it('uses "Data Point" terminology, not "Question", for the progress label', async () => {
    await begin("en");
    // The stepper label is Data Points, and the progress reads Data Point N.
    expect(screen.getAllByText("appointment.stepQualify").length).toBeGreaterThan(0);
    expect(screen.getByTestId("qual-progress")).toHaveTextContent("appointment.qualifyProgress:1/6");
  });

  it("shows Data Point 1 (exact authored wording) immediately after Begin", async () => {
    await begin("en");
    expect(screen.getByTestId("current-question")).toHaveTextContent(getQualificationQuestions("en")[0].question);
    expect(screen.getByTestId("quick-replies")).toBeInTheDocument();
  });

  it("shows the processing wording while the answer is being recorded", async () => {
    await begin("en");
    fireEvent.click(screen.getByTestId("quick-reply-yes"));
    expect(screen.getByTestId("quick-reply-processing")).toHaveTextContent("appointment.stateProcessing");
  });

  it("advances the displayed data point only when the SERVER records the answer", async () => {
    await begin("en");
    const questions = getQualificationQuestions("en");
    expect(screen.getByTestId("current-question")).toHaveTextContent(questions[0].question);
    fireEvent.click(screen.getByTestId("quick-reply-yes"));
    await waitFor(() => expect(screen.getByTestId("current-question")).toHaveTextContent(questions[1].question));
  });

  it("renders the server-recorded answers as classification-only records (no free text)", async () => {
    await begin("en");
    fireEvent.click(screen.getByTestId("quick-reply-no"));
    // The recorded answer shows the classification pill, never a spoken/typed sentence.
    await waitFor(() => expect(screen.getByTestId("answer-1")).toBeInTheDocument());
    expect(screen.getByTestId("answer-1")).toHaveTextContent("NO");
  });

  it("Continue is absent until all six data points are recorded, and never depends on lead scoring", async () => {
    await begin("en");
    expect(screen.queryByTestId("qualification-continue")).toBeNull();
    await answerThrough(5);
    // Five answered — still no Continue.
    await waitFor(() => expect(screen.getByTestId("qual-progress")).toHaveTextContent("appointment.qualifyProgress:6/6"));
    expect(screen.queryByTestId("qualification-continue")).toBeNull();
    fireEvent.click(screen.getByTestId("quick-reply-yes")); // sixth
    expect(await screen.findByTestId("qualification-continue")).toBeInTheDocument();
  });

  it("completing the six data points does NOT auto-open Select Time — the visitor must click Continue", async () => {
    await begin("en");
    await answerThrough(6);
    await screen.findByTestId("qualification-continue");
    expect(screen.queryByText("appointment.chooseSlotTitle")).toBeNull();
  });

  it("clicking Continue opens Select Time", async () => {
    await begin("en");
    await answerThrough(6);
    fireEvent.click(await screen.findByTestId("qualification-continue"));
    expect(await screen.findByText("appointment.chooseSlotTitle")).toBeInTheDocument();
  });

  it("never contacts a voice provider — only availability GET and the answer POST", async () => {
    await begin("en");
    await answerThrough(2);
    const urls = (global.fetch as jest.Mock).mock.calls.map((c) => String(c[0]));
    expect(urls.some((u) => /vapi|daily|tts|\/pitch|audio/i.test(u))).toBe(false);
    expect(urls.some((u) => u.includes("/qualification-status"))).toBe(true);
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
