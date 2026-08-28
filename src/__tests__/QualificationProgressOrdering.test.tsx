/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { AppointmentModal } from "@/features/voice/components/AppointmentModal";
import {
  getAnswerGuidance,
  getQualificationQuestions,
  withAnswerGuidance,
} from "@/features/voice/lib/qualificationScript";

/**
 * Which question the modal shows when its two sources of truth disagree.
 *
 * There are two, and they arrive independently: the assistant's transcript
 * (what was just spoken) and the qualification-status poll (what the server
 * has actually recorded). Either can be first — the poll runs on its own
 * timer and a transcript event can land mid-interval — so the display has to
 * be right under both orderings, and must never walk backwards when a slow
 * response finally arrives.
 *
 * This matters beyond cosmetics: the displayed question number is what a
 * tapped answer is filed against and what its lock is keyed to. Showing a
 * stale question would misfile the next tap.
 */

const t = (key: string, vars?: Record<string, string>) => (vars ? `${key}:${Object.values(vars).join("/")}` : key);
const QUESTIONS = getQualificationQuestions("en");

type Answer = { n: number; c: string; a: string };
type Message = { role: "assistant" | "user"; content: string };

let served: { qualified: boolean; answers: Answer[] } = { qualified: false, answers: [] };

/** The assistant having just asked question `n`. */
const spoke = (n: number): Message => ({
  role: "assistant",
  content: withAnswerGuidance(QUESTIONS[n - 1].question, getAnswerGuidance("en")),
});

/** The server having recorded answers 1..n. */
const recorded = (n: number): Answer[] => Array.from({ length: n }, (_, i) => ({ n: i + 1, c: "YES", a: "Yes" }));

const sendUserMessage = jest.fn(() => true);

function view(messages: Message[]) {
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
      voice={
        {
          voiceState: "listening",
          callId: "call-1",
          startCall: jest.fn(),
          endCall: jest.fn(),
          messages,
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
  served = { qualified: false, answers: [] };
  global.fetch = jest.fn(async (url: RequestInfo | URL) =>
    String(url).includes("qualification-status")
      ? ({ ok: true, status: 200, json: async () => served } as unknown as Response)
      : ({ ok: true, status: 200, json: async () => ({}) } as unknown as Response)
  ) as unknown as typeof fetch;
});

afterEach(() => {
  jest.useRealTimers();
});

/** Lets the component's own polling loop run — never replaced, only fed. */
async function poll() {
  await act(async () => {
    jest.advanceTimersByTime(4000);
  });
}

function start() {
  act(() => {
    fireEvent.click(screen.getByTestId("start-qualification"));
  });
}

const shown = () => screen.getByTestId("current-question").textContent ?? "";

describe("transcript and status arriving in either order", () => {
  it("CASE A — status first, then the transcript catches up", async () => {
    const { rerender } = render(view([]));
    start();

    // The server has recorded Q1's answer; the assistant has not been heard
    // asking Q2 yet.
    served = { qualified: false, answers: recorded(1) };
    await poll();
    expect(shown()).toContain(QUESTIONS[1].question);

    // The transcript arrives saying the same thing. Nothing should move.
    rerender(view([spoke(2)]));
    await poll();
    expect(shown()).toContain(QUESTIONS[1].question);
  });

  it("CASE B — transcript first, then the status catches up", async () => {
    const { rerender } = render(view([]));
    start();

    rerender(view([spoke(2)]));
    await poll();
    expect(shown()).toContain(QUESTIONS[1].question);

    served = { qualified: false, answers: recorded(1) };
    await poll();
    expect(shown()).toContain(QUESTIONS[1].question);
  });

  it("CASE C — status, transcript, then the next status moves it on", async () => {
    const { rerender } = render(view([]));
    start();

    served = { qualified: false, answers: recorded(1) };
    await poll();
    rerender(view([spoke(2)]));
    await poll();
    expect(shown()).toContain(QUESTIONS[1].question);

    // Q2 is answered too — the visitor belongs on Q3 even though the
    // assistant has not been heard asking it yet.
    served = { qualified: false, answers: recorded(2) };
    await poll();
    expect(shown()).toContain(QUESTIONS[2].question);
  });

  it("CASE D — a late status response must not drag the question backwards", async () => {
    const { rerender } = render(view([]));
    start();

    // The assistant is already on Q3.
    rerender(view([spoke(2), spoke(3)]));
    await poll();
    expect(shown()).toContain(QUESTIONS[2].question);

    // A slow response from earlier in the call finally lands, reporting only
    // one answer. The display must stay on Q3.
    served = { qualified: false, answers: recorded(1) };
    await poll();
    expect(shown()).toContain(QUESTIONS[2].question);
  });

  it("never regresses across a full run, whichever source leads", async () => {
    const { rerender } = render(view([]));
    start();

    const seen: string[] = [];
    let messages: Message[] = [];
    for (let n = 1; n <= 5; n++) {
      // Alternate which source leads, so neither ordering is privileged.
      if (n % 2 === 0) {
        messages = [...messages, spoke(n + 1)];
        rerender(view(messages));
        await poll();
        served = { qualified: false, answers: recorded(n) };
        await poll();
      } else {
        served = { qualified: false, answers: recorded(n) };
        await poll();
        messages = [...messages, spoke(n + 1)];
        rerender(view(messages));
        await poll();
      }
      seen.push(shown());
    }

    // Strictly forward: Q2, Q3, Q4, Q5, Q6.
    seen.forEach((text, index) => {
      expect(text).toContain(QUESTIONS[index + 1].question);
    });
  });
});

describe("a tap never persists anything itself", () => {
  it("only reads the server's status — the answer travels through the session", async () => {
    render(view([]));
    start();

    act(() => {
      fireEvent.click(screen.getByTestId("quick-reply-yes"));
    });
    await poll();

    const requests = (global.fetch as jest.Mock).mock.calls.map((call) => ({
      url: String(call[0]),
      method: (call[1]?.method ?? "GET").toUpperCase(),
    }));

    // A tap must not write anything. The component legitimately READS —
    // the status poll and the availability lookup — but if an answer were
    // ever persisted straight from React, a write would appear here, and
    // that is where a second qualification path would begin.
    expect(requests.length).toBeGreaterThan(0);
    for (const request of requests) {
      expect(request.method).toBe("GET");
    }
    expect(requests.some((r) => r.url.includes("qualification-status"))).toBe(true);
    expect(requests.some((r) => /leads|qualification-answer|classify/.test(r.url))).toBe(false);
    // The word went into the conversation instead.
    expect(sendUserMessage).toHaveBeenCalledWith("Yes");
  });
});

describe("the tap lock follows the same progression", () => {
  it("re-opens for the next question once the server has moved on", async () => {
    const { rerender } = render(view([]));
    start();

    act(() => {
      fireEvent.click(screen.getByTestId("quick-reply-yes"));
    });
    expect(sendUserMessage).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("quick-reply-yes")).toBeDisabled();

    served = { qualified: false, answers: recorded(1) };
    await poll();
    rerender(view([spoke(2)]));
    await poll();

    expect(shown()).toContain(QUESTIONS[1].question);
    expect(screen.getByTestId("quick-reply-yes")).not.toBeDisabled();

    act(() => {
      fireEvent.click(screen.getByTestId("quick-reply-no"));
    });
    expect(sendUserMessage).toHaveBeenCalledTimes(2);
    expect(sendUserMessage).toHaveBeenLastCalledWith("No");
  });

  it("holds the lock while the server has not yet caught up", async () => {
    render(view([]));
    start();

    act(() => {
      fireEvent.click(screen.getByTestId("quick-reply-yes"));
    });

    // Nothing has advanced yet — the answer is still in flight. A second tap
    // must not send again just because time passed.
    await poll();
    expect(screen.getByTestId("quick-reply-yes")).toBeDisabled();
    act(() => {
      fireEvent.click(screen.getByTestId("quick-reply-maybe"));
    });
    expect(sendUserMessage).toHaveBeenCalledTimes(1);
  });
});
