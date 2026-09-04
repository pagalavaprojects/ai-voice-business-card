/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";
import { AppointmentModal } from "@/features/voice/components/AppointmentModal";
import { getQualificationQuestions } from "@/features/voice/lib/qualificationScript";

/**
 * Server-authoritative, forward-only progression in the voiceless flow. The
 * active data point is derived only from the answers the SERVER has recorded
 * (returned by the answer POST) — never from client state — so it can never
 * skip, regress, or run ahead of what was actually accepted. Because taps are
 * serialized by the per-data-point lock (the options are hidden while an answer
 * is in flight), there is only ever one POST outstanding, so responses cannot
 * apply out of order; a response from a session the visitor has since left
 * (skip/close) is discarded by the run token.
 */

const t = (key: string, vars?: Record<string, string>) => (vars ? `${key}:${Object.values(vars).join("/")}` : key);
const questions = getQualificationQuestions("en");

/** A fetch mock whose POST resolution can be deferred, so tests can observe the
 * in-flight (locked) state before the server answer lands. */
function installControllableMock() {
  const recorded: Array<{ n: number; c: string; a: string }> = [];
  let pending: (() => void) | null = null;
  global.fetch = jest.fn((url: string, init?: RequestInit) => {
    const u = String(url);
    if (u.includes("/qualification-status") && init?.method === "POST") {
      const body = JSON.parse(String(init.body));
      return new Promise((resolve) => {
        const settle = () => {
          if (!recorded.some((a) => a.n === body.questionNumber)) recorded.push({ n: body.questionNumber, c: "YES", a: body.answer });
          resolve({ ok: true, status: 200, json: async () => ({ answers: [...recorded], qualified: recorded.some((a) => a.n === 6), accepted: true }) } as never);
        };
        pending = settle;
      });
    }
    return Promise.resolve({ ok: true, status: 200, json: async () => ({ configured: true, slots: [] }) } as never);
  }) as unknown as typeof fetch;
  return {
    recorded,
    flush: async () => {
      await act(async () => {
        pending?.();
        pending = null;
        await Promise.resolve();
      });
    },
  };
}

function props() {
  return { open: true, onClose: jest.fn(), companyId: "comp-1", employeeId: "emp-1", employeeName: "Srinivasan Kandasamy", companyName: "Pagalava", language: "en" as never, t, qualifyFirst: true };
}
async function begin() {
  render(<AppointmentModal {...props()} />);
  await act(async () => {
    fireEvent.click(screen.getByTestId("start-qualification"));
  });
}

beforeEach(() => jest.clearAllMocks());

describe("forward-only, server-driven progression", () => {
  it("holds the current data point (locked, no options) until the server records the answer, then moves on", async () => {
    const ctl = installControllableMock();
    await begin();
    expect(screen.getByTestId("current-question")).toHaveTextContent(questions[0].question);

    fireEvent.click(screen.getByTestId("quick-reply-yes"));
    // In flight: the data point is unchanged, options are gone, processing shows.
    expect(screen.getByTestId("current-question")).toHaveTextContent(questions[0].question);
    expect(screen.queryByTestId("quick-replies")).toBeNull();
    expect(screen.getByTestId("quick-reply-processing")).toBeInTheDocument();

    await ctl.flush();
    // Server recorded it → advance to DP2 with a fresh option row.
    await waitFor(() => expect(screen.getByTestId("current-question")).toHaveTextContent(questions[1].question));
    expect(screen.getByTestId("quick-replies")).toBeInTheDocument();
  });

  it("never regresses or skips across a full six-data-point run", async () => {
    const ctl = installControllableMock();
    await begin();
    const seen: string[] = [];
    for (let n = 1; n <= 6; n++) {
      await waitFor(() => expect(screen.getByTestId("quick-replies")).toBeInTheDocument());
      seen.push(screen.getByTestId("current-question").textContent || "");
      fireEvent.click(screen.getByTestId("quick-reply-yes"));
      await ctl.flush();
    }
    // Each data point appeared exactly once, in authored order.
    expect(seen).toEqual(questions.map((q) => q.question));
    await waitFor(() => expect(screen.getByTestId("qualification-continue")).toBeInTheDocument());
  });

  it("a response from a session the visitor has left (Skip) does not repopulate the new step", async () => {
    const ctl = installControllableMock();
    await begin();
    fireEvent.click(screen.getByTestId("quick-reply-yes")); // POST in flight
    // Visitor skips to Select Time before the answer lands.
    fireEvent.click(screen.getByTestId("skip-qualification"));
    expect(await screen.findByText("appointment.chooseSlotTitle")).toBeInTheDocument();
    // The late answer resolves — it must not drag the UI back into qualification.
    await ctl.flush();
    expect(screen.getByText("appointment.chooseSlotTitle")).toBeInTheDocument();
    expect(screen.queryByTestId("current-question")).toBeNull();
  });
});
