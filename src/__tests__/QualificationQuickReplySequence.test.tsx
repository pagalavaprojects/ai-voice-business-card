/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";
import { AppointmentModal } from "@/features/voice/components/AppointmentModal";
import { getQualificationQuestions } from "@/features/voice/lib/qualificationScript";

/**
 * The full voiceless data-point walk: DP1 → … → DP6 → Continue → Select Time.
 * Every answer is a Yes/No/Maybe tap POSTed to the server-authoritative
 * endpoint; the display advances strictly forward from the authoritative
 * response, never from client state. No microphone, no Vapi, no audio.
 */

const t = (key: string, vars?: Record<string, string>) => (vars ? `${key}:${Object.values(vars).join("/")}` : key);
const classOf = (label: string): "YES" | "NO" | "MAYBE" =>
  label === "Yes" || label === "ஆம்" ? "YES" : label === "No" || label === "இல்லை" ? "NO" : "MAYBE";

function installFetchMock() {
  const recorded: Array<{ n: number; c: string; a: string }> = [];
  global.fetch = jest.fn(async (url: string, init?: RequestInit) => {
    const u = String(url);
    if (u.includes("/qualification-status") && init?.method === "POST") {
      const body = JSON.parse(String(init.body));
      if (!recorded.some((a) => a.n === body.questionNumber)) recorded.push({ n: body.questionNumber, c: classOf(body.answer), a: body.answer });
      return { ok: true, status: 200, json: async () => ({ answers: [...recorded], qualified: recorded.some((a) => a.n === 6), accepted: true }) };
    }
    return { ok: true, status: 200, json: async () => ({ configured: true, slots: [{ time: "2027-01-01T09:00:00.000Z" }] }) };
  }) as unknown as typeof fetch;
}

function props(language: "en" | "ta" = "en") {
  return { open: true, onClose: jest.fn(), companyId: "comp-1", employeeId: "emp-1", employeeName: "Srinivasan Kandasamy", companyName: "Pagalava", language: language as never, t, qualifyFirst: true };
}

beforeEach(() => {
  jest.clearAllMocks();
  installFetchMock();
});

describe("the six-data-point sequence", () => {
  it("offers a fresh set of options for every data point, advances forward, then hands off to Continue after the sixth", async () => {
    render(<AppointmentModal {...props("en")} />);
    await act(async () => {
      fireEvent.click(screen.getByTestId("start-qualification"));
    });
    const questions = getQualificationQuestions("en");

    for (let n = 1; n <= 6; n++) {
      // The correct data point is on screen, with its three options and the
      // "Data Point n of 6" progress label.
      await waitFor(() => expect(screen.getByTestId("current-question")).toHaveTextContent(questions[n - 1].question));
      expect(screen.getByTestId("qual-progress")).toHaveTextContent(`appointment.qualifyProgress:${n}/6`);
      expect(screen.getByTestId("quick-replies")).toBeInTheDocument();
      fireEvent.click(screen.getByTestId("quick-reply-yes"));
    }

    // After the sixth answer: no more options, and Continue appears.
    await waitFor(() => expect(screen.getByTestId("qualification-continue")).toBeInTheDocument());
    expect(screen.queryByTestId("quick-replies")).toBeNull();
    expect(screen.queryByTestId("current-question")).toBeNull();
  });

  it("Continue opens the Select Time step (the only way the calendar opens)", async () => {
    render(<AppointmentModal {...props("en")} />);
    await act(async () => {
      fireEvent.click(screen.getByTestId("start-qualification"));
    });
    for (let n = 1; n <= 6; n++) {
      await waitFor(() => expect(screen.getByTestId("quick-replies")).toBeInTheDocument());
      fireEvent.click(screen.getByTestId("quick-reply-maybe"));
    }
    const cont = await screen.findByTestId("qualification-continue");
    // The calendar has NOT opened yet — completion alone never opens it.
    expect(screen.queryByText("appointment.chooseSlotTitle")).toBeNull();
    fireEvent.click(cont);
    expect(await screen.findByText("appointment.chooseSlotTitle")).toBeInTheDocument();
  });
});

describe("the sequence under failure", () => {
  it("keeps a data point answerable when its answer POST fails", async () => {
    render(<AppointmentModal {...props("en")} />);
    await act(async () => {
      fireEvent.click(screen.getByTestId("start-qualification"));
    });
    await waitFor(() => expect(screen.getByTestId("quick-replies")).toBeInTheDocument());
    // Fail the next POST.
    (global.fetch as jest.Mock).mockImplementationOnce(async () => ({ ok: false, status: 500, json: async () => ({}) }));
    fireEvent.click(screen.getByTestId("quick-reply-yes"));
    await waitFor(() => expect(screen.getByTestId("qual-answer-error")).toBeInTheDocument());
    // The options are back so the visitor can retry — no dead row.
    expect(screen.getByTestId("quick-replies")).toBeInTheDocument();
    expect(screen.getByTestId("current-question")).toBeInTheDocument();
  });
});
