/**
 * @jest-environment jsdom
 *
 * Regression (F-08, 2026-09-07 certification): on the Tamil card the
 * answered-data-point badge rendered the SERVER classification code ("YES")
 * in English, inside an otherwise fully Tamil recap. The badge must show the
 * quick-reply label of the UI language for that classification
 * (ஆம் / இல்லை / இருந்தாலும் in Tamil, Yes / No / Maybe in English) while the
 * classification itself stays exactly what the server recorded.
 */
import "@testing-library/jest-dom";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";
import { AppointmentModal } from "@/features/voice/components/AppointmentModal";

const t = (key: string, vars?: Record<string, string>) => (vars ? `${key}:${Object.values(vars).join("/")}` : key);

const classOf = (label: string): "YES" | "NO" | "MAYBE" =>
  label === "Yes" || label === "ஆம்" ? "YES" : label === "No" || label === "இல்லை" ? "NO" : "MAYBE";

function installFetchMock() {
  const recorded: Array<{ n: number; c: string; a: string }> = [];
  global.fetch = jest.fn(async (url: string, init?: RequestInit) => {
    if (String(url).includes("/qualification-status") && init?.method === "POST") {
      const body = JSON.parse(String(init.body));
      if (!recorded.some((a) => a.n === body.questionNumber)) {
        recorded.push({ n: body.questionNumber, c: classOf(body.answer), a: body.answer });
      }
      return { ok: true, status: 200, json: async () => ({ answers: [...recorded], qualified: false, accepted: true }) };
    }
    return { ok: true, status: 200, json: async () => ({ configured: true, slots: [] }) };
  }) as unknown as typeof fetch;
}

async function answerFirstDataPoint(language: "en" | "ta", testId: string) {
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
      qualifyFirst
    />
  );
  await act(async () => {
    fireEvent.click(screen.getByTestId("start-qualification"));
  });
  fireEvent.click(screen.getByTestId(testId));
  await waitFor(() => expect(screen.getByTestId("answer-1")).toBeInTheDocument());
  return screen.getByTestId("answer-1");
}

beforeEach(() => {
  jest.clearAllMocks();
  installFetchMock();
});

describe("answered data-point badge is localised (F-08)", () => {
  it("shows ஆம் — not the English code YES — on the Tamil card", async () => {
    const badge = await answerFirstDataPoint("ta", "quick-reply-yes");
    expect(badge).toHaveTextContent("ஆம்");
    expect(badge.textContent).not.toMatch(/\bYES\b/);
  });

  it("shows இருந்தாலும் for a Tamil MAYBE", async () => {
    const badge = await answerFirstDataPoint("ta", "quick-reply-maybe");
    expect(badge).toHaveTextContent("இருந்தாலும்");
    expect(badge.textContent).not.toMatch(/\bMAYBE\b/);
  });

  it("shows Yes on the English card", async () => {
    const badge = await answerFirstDataPoint("en", "quick-reply-yes");
    expect(badge).toHaveTextContent("Yes");
  });
});
