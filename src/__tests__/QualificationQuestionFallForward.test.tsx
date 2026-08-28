/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { AppointmentModal } from "@/features/voice/components/AppointmentModal";
import { getQualificationQuestions } from "@/features/voice/lib/qualificationScript";

/**
 * Which question is on screen when the transcript has not caught up.
 *
 * The modal normally learns the current question from the assistant's own
 * words, but the server's record of answers can arrive first — the status
 * poll is independent of transcript events, and on a slow or lossy
 * connection it routinely wins. In that window the only truth available is
 * "the server has N answers", and the visitor must be looking at question
 * N+1 with its options, not still at the one they already answered.
 *
 * This path had no coverage, and it is the one that decides what a tap
 * answers: showing a stale question here would mean the next tap is filed
 * against the wrong number.
 */

const t = (key: string, vars?: Record<string, string>) => (vars ? `${key}:${Object.values(vars).join("/")}` : key);

let recordedAnswers: Array<{ n: number; c: string; a: string }> = [];

beforeEach(() => {
  jest.useFakeTimers();
  global.fetch = jest.fn(async (url: RequestInfo | URL) =>
    String(url).includes("qualification-status")
      ? ({ ok: true, status: 200, json: async () => ({ qualified: false, answers: recordedAnswers }) } as unknown as Response)
      : ({ ok: true, status: 200, json: async () => ({}) } as unknown as Response)
  ) as unknown as typeof fetch;
});

afterEach(() => {
  jest.useRealTimers();
});

function renderWithNoTranscript(language: "en" | "ta") {
  render(
    <AppointmentModal
      open
      onClose={jest.fn()}
      companyId="comp-1"
      employeeId="emp-1"
      employeeName="Srinivasan Kandasamy"
      companyName="Pagalava"
      language={language as never}
      t={t}
      voice={
        {
          voiceState: "listening",
          callId: "call-1",
          startCall: jest.fn(),
          endCall: jest.fn(),
          // Deliberately empty: the server's answers are the only signal.
          messages: [],
          error: null,
          sendUserMessage: jest.fn(() => true),
        } as never
      }
    />
  );
  act(() => {
    fireEvent.click(screen.getByTestId("start-qualification"));
  });
}

describe.each(["en", "ta"] as const)("current question from recorded answers alone (%s)", (language) => {
  it.each([1, 2, 3, 4, 5])("with %i answered, shows the next unanswered question and its options", async (answered) => {
    recordedAnswers = Array.from({ length: answered }, (_, i) => ({ n: i + 1, c: "YES", a: "Yes" }));
    renderWithNoTranscript(language);

    await act(async () => {
      jest.advanceTimersByTime(4000);
    });

    const expected = getQualificationQuestions(language)[answered];
    expect(screen.getByTestId("current-question")).toHaveTextContent(expected.question);
    expect(screen.getByTestId("qual-progress")).toHaveTextContent(String(answered + 1));
    // Every one of those questions is answerable by tapping.
    expect(screen.getByTestId("quick-replies")).toBeInTheDocument();
  });
});
