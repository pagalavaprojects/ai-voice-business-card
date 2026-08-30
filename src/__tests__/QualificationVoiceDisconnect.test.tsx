/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { AppointmentModal } from "@/features/voice/components/AppointmentModal";
import { getQualificationQuestions } from "@/features/voice/lib/qualificationScript";

/**
 * What the questionnaire does when the voice session drops mid-answer.
 *
 * The tappable answers are only a shortcut into the SAME live conversation a
 * spoken reply travels — so once that session is gone (a WebRTC ejection, a
 * mic/connection error), a tap can no longer deliver anything. The SDK's
 * send() does not throw on a dead meeting, so the tap's own return value
 * cannot catch it; the buttons would simply sit there absorbing dead taps.
 *
 * The contract these tests pin down: while the session is healthy the options
 * are live; the moment the session reports an error they give way to a clear
 * reconnect affordance (the current question preserved), no dead-tappable row
 * remains, and the Skip escape is always there. When the error clears — a
 * successful reconnect — the options come back.
 */

const t = (key: string, vars?: Record<string, string>) => (vars ? `${key}:${Object.values(vars).join("/")}` : key);
const QUESTIONS = getQualificationQuestions("en");

function voiceProp(overrides: Record<string, unknown> = {}) {
  return {
    voiceState: "listening",
    callId: "call-1",
    startCall: jest.fn(),
    endCall: jest.fn(),
    messages: [] as Array<{ role: "assistant" | "user"; content: string }>,
    error: null as string | null,
    sendUserMessage: jest.fn(() => true),
    ...overrides,
  };
}

function view(voice: ReturnType<typeof voiceProp>) {
  return (
    <AppointmentModal
      open
      onClose={jest.fn()}
      companyId="comp-1"
      employeeId="emp-1"
      employeeName="Srinivasan Kandasamy"
      companyName="Pagalava"
      language={"en" as never}
      t={t}
      voice={voice as never}
    />
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  global.fetch = jest.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({ answers: [], qualified: false }),
  })) as unknown as typeof fetch;
});

function start() {
  act(() => {
    fireEvent.click(screen.getByTestId("start-qualification"));
  });
}

describe("reopening the modal after an answer was in flight", () => {
  it("clears the leftover quick-reply claim so the next session's Q1 is answerable", () => {
    // The modal is reused, never unmounted. A visitor who answered Q1 and then
    // closed the modal must not reopen to a Q1 whose options are gone,
    // replaced by a processing spinner that can never resolve (its claim
    // belonged to the closed session).
    render(view(voiceProp()));
    start();
    act(() => {
      fireEvent.click(screen.getByTestId("quick-reply-yes"));
    });
    // Q1 is now showing the processing state, with a live claim on question 1.
    expect(screen.getByTestId("quick-reply-processing")).toBeInTheDocument();

    // Close (handleReset) then reopen the questionnaire.
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "buttons.close" }));
    });
    start();

    // A fresh Q1 with tappable options — no stale processing spinner.
    expect(screen.getByTestId("quick-replies")).toBeInTheDocument();
    expect(screen.queryByTestId("quick-reply-processing")).toBeNull();
    expect(screen.getByTestId("quick-reply-yes")).not.toBeDisabled();
  });
});

describe("a healthy session still shows tappable answers", () => {
  it("renders the options and no disconnected state while error is null", () => {
    render(view(voiceProp()));
    start();

    expect(screen.getByTestId("quick-replies")).toBeInTheDocument();
    expect(screen.getByTestId("quick-reply-yes")).not.toBeDisabled();
    expect(screen.queryByTestId("quick-reply-disconnected")).toBeNull();
    expect(screen.queryByTestId("quick-reply-reconnect")).toBeNull();
  });
});

describe("the voice session dropping mid-questionnaire", () => {
  it("replaces the options with a reconnect affordance, keeping the question", () => {
    const startCall = jest.fn();
    const { rerender } = render(view(voiceProp({ startCall })));
    start();
    // Q1 is on screen with its options.
    expect(screen.getByTestId("current-question")).toHaveTextContent(QUESTIONS[0].question);
    expect(screen.getByTestId("quick-replies")).toBeInTheDocument();

    // The session reports a connection error and drops.
    rerender(view(voiceProp({ startCall, error: "Voice connection error", voiceState: "idle" })));

    // The dead-tappable row is gone; the reconnect affordance is shown; the
    // current question is preserved so nothing is lost visually.
    expect(screen.queryByTestId("quick-replies")).toBeNull();
    expect(screen.queryByTestId("quick-reply-processing")).toBeNull();
    expect(screen.getByTestId("quick-reply-disconnected")).toBeInTheDocument();
    expect(screen.getByTestId("current-question")).toHaveTextContent(QUESTIONS[0].question);
    // The escape hatch is never removed.
    expect(screen.getByTestId("skip-qualification")).toBeInTheDocument();
  });

  it("cannot dead-tap an answer: no answer button exists to send a no-op", () => {
    const sendUserMessage = jest.fn(() => true);
    const { rerender } = render(view(voiceProp({ sendUserMessage })));
    start();
    rerender(view(voiceProp({ sendUserMessage, error: "Voice connection error", voiceState: "idle" })));

    // There is simply no answer button to tap — the failure mode (a tap that
    // silently sends nothing) is impossible because the control is gone.
    expect(screen.queryByTestId("quick-reply-yes")).toBeNull();
    expect(screen.queryByTestId("quick-reply-no")).toBeNull();
    expect(screen.queryByTestId("quick-reply-maybe")).toBeNull();
    expect(sendUserMessage).not.toHaveBeenCalled();
  });

  it("reconnect restarts the voice conversation without sending an answer", () => {
    const startCall = jest.fn();
    const sendUserMessage = jest.fn(() => true);
    const { rerender } = render(view(voiceProp({ startCall, sendUserMessage })));
    start();
    rerender(view(voiceProp({ startCall, sendUserMessage, error: "Voice connection error", voiceState: "idle" })));

    // Ignore the startCall from starting the questionnaire; isolate reconnect.
    startCall.mockClear();
    act(() => {
      fireEvent.click(screen.getByTestId("quick-reply-reconnect"));
    });

    // Reconnect starts a fresh call; it must never be mistaken for an answer.
    expect(startCall).toHaveBeenCalledTimes(1);
    expect(sendUserMessage).not.toHaveBeenCalled();
  });

  it("replaces the in-flight processing state with reconnect when the drop lands after a tap", () => {
    // The visitor taps an answer (processing shown), then the session drops
    // before the server records it. The processing spinner must not sit there
    // forever — it gives way to the same reconnect affordance, so a dropped
    // answer is recoverable rather than a permanent dead wait.
    const { rerender } = render(view(voiceProp()));
    start();
    act(() => {
      fireEvent.click(screen.getByTestId("quick-reply-yes"));
    });
    expect(screen.getByTestId("quick-reply-processing")).toBeInTheDocument();

    // The session errors out while the answer is still in flight.
    rerender(view(voiceProp({ error: "Voice connection error", voiceState: "idle" })));

    expect(screen.queryByTestId("quick-reply-processing")).toBeNull();
    expect(screen.getByTestId("quick-reply-disconnected")).toBeInTheDocument();
    expect(screen.getByTestId("current-question")).toHaveTextContent(QUESTIONS[0].question);
    expect(screen.getByTestId("skip-qualification")).toBeInTheDocument();
  });

  it("restores the tappable options once the error clears (reconnected)", () => {
    const { rerender } = render(view(voiceProp()));
    start();
    rerender(view(voiceProp({ error: "Voice connection error", voiceState: "idle" })));
    expect(screen.getByTestId("quick-reply-disconnected")).toBeInTheDocument();

    // A successful reconnect clears the error and returns to a live state.
    rerender(view(voiceProp({ error: null, voiceState: "listening" })));
    expect(screen.queryByTestId("quick-reply-disconnected")).toBeNull();
    expect(screen.getByTestId("quick-replies")).toBeInTheDocument();
    expect(screen.getByTestId("quick-reply-yes")).not.toBeDisabled();
  });
});
