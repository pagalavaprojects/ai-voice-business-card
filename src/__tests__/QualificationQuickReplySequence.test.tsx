/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";
import { AppointmentModal } from "@/features/voice/components/AppointmentModal";
import {
  getAnswerGuidance,
  getQualificationQuestions,
  getQuickReplyOptions,
  withAnswerGuidance,
} from "@/features/voice/lib/qualificationScript";

/**
 * The whole six-question lifecycle of the tappable answers, walked end to
 * end the way production drives it.
 *
 * "The buttons exist" is not the property that matters — the one that
 * matters is that they come back for EVERY question and then stop. A row
 * that locked on Q1 and never reopened, or one that kept accepting taps
 * after Q6, would both look fine in a single-question test.
 *
 * Progress arrives here exactly as it does live: the assistant's transcript
 * carries the next question, and the qualification-status poll reports the
 * answers the SERVER recorded. Nothing in this file classifies or stores an
 * answer, because nothing in the component does either.
 */

const sendUserMessage = jest.fn(() => true);
const t = (key: string, vars?: Record<string, string>) => (vars ? `${key}:${Object.values(vars).join("/")}` : key);

type Answer = { n: number; c: string; a: string };

/** The server's view of the call, which the modal polls. */
let recordedAnswers: Answer[] = [];
let qualified = false;
/** What the assistant has said so far — the modal reads the current question
 * from the last utterance that matches an authored one. */
let transcript: Array<{ role: "assistant" | "user"; content: string }> = [];

function renderModal(language: "en" | "ta") {
  return render(
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
          messages: transcript,
          error: null,
          sendUserMessage,
        } as never
      }
    />
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  recordedAnswers = [];
  qualified = false;
  transcript = [];
  global.fetch = jest.fn(async (url: RequestInfo | URL) => {
    if (String(url).includes("qualification-status")) {
      return { ok: true, status: 200, json: async () => ({ qualified, answers: recordedAnswers }) } as unknown as Response;
    }
    return { ok: true, status: 200, json: async () => ({}) } as unknown as Response;
  }) as unknown as typeof fetch;
});

afterEach(() => {
  jest.useRealTimers();
});

/** Advances the modal's polling so it picks up the server's latest state. */
async function letThePollCatchUp() {
  await act(async () => {
    jest.advanceTimersByTime(3500);
  });
}

describe.each([
  ["en" as const, ["Yes", "No", "Maybe", "Yes", "No", "Maybe"]],
  ["ta" as const, ["ஆம்", "இல்லை", "இருந்தாலும்", "ஆம்", "இல்லை", "இருந்தாலும்"]],
])("tapping through all six questions in %s", (language, answers) => {
  it("offers a fresh set of options for every question, then stops after the sixth", async () => {
    const questions = getQualificationQuestions(language);
    const options = getQuickReplyOptions(language);
    const { rerender } = renderModal(language);

    act(() => {
      fireEvent.click(screen.getByTestId("start-qualification"));
    });

    for (let index = 0; index < 6; index++) {
      const question = questions[index];
      const chosen = answers[index];
      const option = options.find((o) => o.label === chosen)!;

      // The question on screen is the authored one, in this language, and
      // the progress label agrees with it.
      expect(screen.getByTestId("current-question")).toHaveTextContent(question.question);
      expect(screen.getByTestId("qual-progress")).toHaveTextContent(String(question.number));
      expect(screen.getByTestId("qual-progress")).toHaveTextContent("6");
      expect(screen.getByTestId("current-question")).toHaveAttribute("lang", language);

      // Exactly three options, all offered fresh for this question — never
      // the previous question's row left attached.
      const group = screen.getByTestId("quick-replies");
      expect(group).toBeInTheDocument();
      const buttons = [...group.querySelectorAll("button")];
      expect(buttons).toHaveLength(3);
      expect(buttons.map((b) => b.textContent?.trim())).toEqual(options.map((o) => o.label));
      for (const o of options) {
        const button = screen.getByTestId(`quick-reply-${o.classification.toLowerCase()}`);
        expect(button).not.toBeDisabled();
        expect(button).toHaveTextContent(o.label);
      }

      // Answer it — twice, to prove one question can only be answered once.
      const button = screen.getByTestId(`quick-reply-${option.classification.toLowerCase()}`);
      act(() => {
        fireEvent.click(button);
        fireEvent.click(button);
      });

      expect(sendUserMessage).toHaveBeenCalledTimes(index + 1);
      expect(sendUserMessage).toHaveBeenLastCalledWith(chosen);

      // The answered question's options give way to a processing indicator —
      // no options remain for it, so nothing stale can be tapped again.
      expect(screen.queryByTestId("quick-replies")).toBeNull();
      expect(screen.getByTestId("quick-reply-processing")).toBeInTheDocument();

      // The server records the answer, and the assistant asks the next one
      // (after the sixth it completes instead).
      recordedAnswers = [...recordedAnswers, { n: question.number, c: option.classification, a: chosen }];
      const next = questions[index + 1];
      if (next) {
        transcript = [...transcript, { role: "assistant", content: withAnswerGuidance(next.question, getAnswerGuidance(language)) }];
      } else {
        qualified = true;
      }

      rerender(
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
              messages: transcript,
              error: null,
              sendUserMessage,
            } as never
          }
        />
      );
      await letThePollCatchUp();
    }

    // Six answers, six sends — never a seventh.
    expect(sendUserMessage).toHaveBeenCalledTimes(6);

    // Qualification is complete: the options are gone and Continue is offered.
    await waitFor(() => expect(screen.getByTestId("qualification-continue")).toBeInTheDocument());
    expect(screen.queryByTestId("quick-replies")).toBeNull();
    expect(screen.queryByTestId("quick-reply-yes")).toBeNull();

    // And nothing moved on by itself: the calendar appears only because the
    // visitor asked for it.
    expect(screen.queryByTestId("slot-picker")).toBeNull();
    await act(async () => {
      fireEvent.click(screen.getByTestId("qualification-continue"));
      await Promise.resolve();
    });
    expect(screen.queryByTestId("qualification-continue")).toBeNull();
    // The slot step is now the one on screen — it asks for a time.
    await waitFor(() => expect(screen.getByRole("heading", { name: /chooseSlotTitle/i })).toBeInTheDocument());
  });
});

describe("the sequence under failure", () => {
  it("keeps a question answerable when its answer could not be delivered", async () => {
    const failing = jest.fn(() => false);
    render(
      <AppointmentModal
        open
        onClose={jest.fn()}
        companyId="comp-1"
        employeeId="emp-1"
        employeeName="Srinivasan Kandasamy"
        companyName="Pagalava"
        language={"en" as never}
        t={t}
        voice={
          {
            voiceState: "listening",
            callId: "call-1",
            startCall: jest.fn(),
            endCall: jest.fn(),
            messages: [],
            error: null,
            sendUserMessage: failing,
          } as never
        }
      />
    );
    act(() => {
      fireEvent.click(screen.getByTestId("start-qualification"));
    });

    act(() => {
      fireEvent.click(screen.getByTestId("quick-reply-yes"));
    });

    // Undelivered means unanswered: the visitor keeps every option, and can
    // try again rather than being stranded on a dead row.
    expect(failing).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("quick-reply-yes")).not.toBeDisabled();
    expect(screen.getByTestId("quick-reply-no")).not.toBeDisabled();

    act(() => {
      fireEvent.click(screen.getByTestId("quick-reply-yes"));
    });
    expect(failing).toHaveBeenCalledTimes(2);
  });
});
