/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";
import { AppointmentModal } from "@/features/voice/components/AppointmentModal";
import { getQualificationQuestions } from "@/features/voice/lib/qualificationScript";

/**
 * Which data point is on screen is decided ONLY by how many answers the server
 * has recorded: with N recorded, the visitor must be looking at data point
 * N+1 with its options — never still at the one already answered, never ahead
 * of what was accepted. This is what keeps a tap filed against the right
 * number.
 */

const t = (key: string, vars?: Record<string, string>) => (vars ? `${key}:${Object.values(vars).join("/")}` : key);
const classOf = (label: string): "YES" | "NO" | "MAYBE" =>
  label === "Yes" || label === "ஆம்" ? "YES" : label === "No" || label === "இல்லை" ? "NO" : "MAYBE";

function installFetchMock() {
  const recorded: Array<{ n: number; c: string; a: string }> = [];
  global.fetch = jest.fn(async (url: string, init?: RequestInit) => {
    if (String(url).includes("/qualification-status") && init?.method === "POST") {
      const body = JSON.parse(String(init.body));
      if (!recorded.some((a) => a.n === body.questionNumber)) recorded.push({ n: body.questionNumber, c: classOf(body.answer), a: body.answer });
      return { ok: true, status: 200, json: async () => ({ answers: [...recorded], qualified: recorded.some((a) => a.n === 6), accepted: true }) };
    }
    return { ok: true, status: 200, json: async () => ({ configured: true, slots: [] }) };
  }) as unknown as typeof fetch;
}

beforeEach(() => {
  jest.clearAllMocks();
  installFetchMock();
});

describe.each(["en", "ta"] as const)("active data point from recorded answers alone (%s)", (language) => {
  it.each([1, 2, 3, 4, 5])("with %i answered, shows the next unanswered data point and its options", async (answered) => {
    render(
      <AppointmentModal open onClose={jest.fn()} companyId="comp-1" employeeId="emp-1" employeeName="Srinivasan Kandasamy" companyName="Pagalava" language={language as never} t={t} qualifyFirst />
    );
    await act(async () => {
      fireEvent.click(screen.getByTestId("start-qualification"));
    });
    // Answer `answered` data points.
    for (let i = 0; i < answered; i++) {
      await waitFor(() => expect(screen.getByTestId("quick-replies")).toBeInTheDocument());
      fireEvent.click(screen.getByTestId("quick-reply-yes"));
    }
    const expected = getQualificationQuestions(language)[answered];
    await waitFor(() => expect(screen.getByTestId("current-question")).toHaveTextContent(expected.question));
    expect(screen.getByTestId("qual-progress")).toHaveTextContent(String(answered + 1));
    expect(screen.getByTestId("quick-replies")).toBeInTheDocument();
  });
});
