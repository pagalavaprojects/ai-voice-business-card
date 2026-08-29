/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { AppointmentModal } from "@/features/voice/components/AppointmentModal";
import {
  classifyClosedResponse,
  getQualificationQuestions,
  getQuickReplyOptions,
  withAnswerGuidance,
  getAnswerGuidance,
} from "@/features/voice/lib/qualificationScript";

/**
 * Tapping Yes/No/Maybe instead of speaking it.
 *
 * The whole point is that a tap is not a second answer system: the label IS
 * the word, it enters the conversation as a USER message, and the server
 * classifies and records it exactly as it would a spoken reply. So the tests
 * that matter are the ones that would catch it quietly becoming a parallel
 * path — a label that does not classify, an answer sent twice, or buttons
 * appearing somewhere there is no question to answer.
 */

const sendUserMessage = jest.fn(() => true);
const startCall = jest.fn();

/** Same stand-in the other modal tests use: keys echo through, so a missing
 * key would be visible rather than silently blank. */
const t = (key: string, vars?: Record<string, string>) => (vars ? `${key}:${Object.values(vars).join("/")}` : key);

function voiceProp(overrides: Record<string, unknown> = {}) {
  return {
    voiceState: "listening",
    callId: "call-1",
    startCall,
    endCall: jest.fn(),
    messages: [] as Array<{ role: "assistant" | "user"; content: string }>,
    error: null,
    sendUserMessage,
    ...overrides,
  };
}

function renderQualification(language: "en" | "ta" = "en", voiceOverrides: Record<string, unknown> = {}) {
  const result = render(
    <AppointmentModal
      open
      onClose={jest.fn()}
      companyId="comp-1"
      employeeId="emp-1"
      employeeName="Srinivasan Kandasamy"
      companyName="Pagalava"
      language={language as never}
      t={t}
      voice={voiceProp(voiceOverrides) as never}
    />
  );
  // The questionnaire only starts on an explicit tap.
  act(() => {
    fireEvent.click(screen.getByTestId("start-qualification"));
  });
  return result;
}

beforeEach(() => {
  jest.clearAllMocks();
  global.fetch = jest.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({ data: { answers: [], complete: false } }),
  })) as unknown as typeof fetch;
});

describe("quick reply labels", () => {
  it("offers Yes / No / Maybe in English", () => {
    expect(getQuickReplyOptions("en").map((o) => o.label)).toEqual(["Yes", "No", "Maybe"]);
  });

  it("offers ஆம் / இல்லை / இருந்தாலும் in Tamil", () => {
    expect(getQuickReplyOptions("ta").map((o) => o.label)).toEqual(["ஆம்", "இல்லை", "இருந்தாலும்"]);
  });

  it("sends a label the SERVER classifier already accepts — in both languages", () => {
    // A label that failed to classify would silently reprompt, which is the
    // exact failure a tappable answer is meant to remove.
    for (const language of ["en", "ta"] as const) {
      for (const option of getQuickReplyOptions(language)) {
        expect(classifyClosedResponse(option.label, language)).toBe(option.classification);
      }
    }
  });

  it("does not classify a Tamil label under English rules, or the reverse", () => {
    expect(classifyClosedResponse("ஆம்", "en")).toBeNull();
    expect(classifyClosedResponse("Yes", "ta")).toBeNull();
  });
});

describe("tapping an answer", () => {
  it("delivers the English word into the conversation, not a classification", () => {
    renderQualification("en");
    fireEvent.click(screen.getByTestId("quick-reply-yes"));

    // The raw word travels; the server decides what it means.
    expect(sendUserMessage).toHaveBeenCalledWith("Yes");
    expect(sendUserMessage).toHaveBeenCalledTimes(1);
  });

  it("delivers the Tamil word on a Tamil card", () => {
    renderQualification("ta");
    fireEvent.click(screen.getByTestId("quick-reply-no"));

    expect(sendUserMessage).toHaveBeenCalledWith("இல்லை");
  });

  it("covers all three classifications", () => {
    renderQualification("en");
    fireEvent.click(screen.getByTestId("quick-reply-maybe"));
    expect(sendUserMessage).toHaveBeenCalledWith("Maybe");
  });

  it("cannot answer the same question twice, however many times it is tapped", () => {
    renderQualification("en");
    const yes = screen.getByTestId("quick-reply-yes");
    const no = screen.getByTestId("quick-reply-no");

    // Batched deliberately: a real double tap fires both clicks before React
    // re-renders, so neither sees the other's state. An earlier version of
    // this test clicked with a render in between and passed while the code
    // was sending twice.
    act(() => {
      fireEvent.click(yes);
      fireEvent.click(yes);
      fireEvent.click(no);
    });

    // One answer per question — a double tap must not advance two questions.
    expect(sendUserMessage).toHaveBeenCalledTimes(1);
    expect(sendUserMessage).toHaveBeenCalledWith("Yes");
  });

  it("replaces the row with a processing indicator once an answer is sent", () => {
    renderQualification("en");
    fireEvent.click(screen.getByTestId("quick-reply-yes"));

    // The options give way to a processing state that belongs to the same
    // question — no locked, greyed row left sitting beside it.
    expect(screen.queryByTestId("quick-replies")).toBeNull();
    expect(screen.getByTestId("quick-reply-processing")).toBeInTheDocument();
  });

  it("keeps the options live when the answer could not be delivered", () => {
    // No session to speak into (demo mode, dropped call): the visitor must
    // not be left with a dead row and no way to answer.
    renderQualification("en", { sendUserMessage: jest.fn(() => false) });
    fireEvent.click(screen.getByTestId("quick-reply-yes"));

    expect(screen.getByTestId("quick-reply-yes")).not.toBeDisabled();
  });

  it("offers a fresh row for the next question", () => {
    const { rerender } = renderQualification("en");
    fireEvent.click(screen.getByTestId("quick-reply-yes"));
    // The answered question now shows processing, not options.
    expect(screen.queryByTestId("quick-replies")).toBeNull();

    // The assistant moves on to Q2; the row belongs to the new question now.
    const questions = getQualificationQuestions("en");
    rerender(
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
          voiceProp({
            messages: [{ role: "assistant", content: withAnswerGuidance(questions[1].question, getAnswerGuidance("en")) }],
          }) as never
        }
      />
    );

    expect(screen.getByTestId("current-question")).toHaveTextContent(questions[1].question);
    expect(screen.getByTestId("quick-reply-yes")).not.toBeDisabled();
  });
});

describe("where the options may appear", () => {
  it("not before the questionnaire has been started", () => {
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
        voice={voiceProp() as never}
      />
    );
    expect(screen.queryByTestId("quick-replies")).toBeNull();
  });

  it("not when the modal has no voice session at all — the plain booking path", () => {
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
      />
    );
    expect(screen.queryByTestId("quick-replies")).toBeNull();
    expect(screen.queryByTestId("start-qualification")).toBeNull();
  });

  it("not when the session cannot accept a typed answer", () => {
    renderQualification("en", { sendUserMessage: undefined });
    expect(screen.queryByTestId("quick-replies")).toBeNull();
  });

  it("shows a question and its options together, in the qualification language", () => {
    renderQualification("ta");
    const group = screen.getByTestId("quick-replies");
    expect(group).toHaveAttribute("role", "group");
    expect(group).toHaveAccessibleName();
    expect(screen.getByTestId("current-question")).toHaveTextContent(getQualificationQuestions("ta")[0].question);
  });
});
