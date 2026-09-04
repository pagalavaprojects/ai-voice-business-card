/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";
import { AppointmentModal } from "@/features/voice/components/AppointmentModal";
import {
  classifyClosedResponse,
  getQualificationQuestions,
  getQuickReplyOptions,
} from "@/features/voice/lib/qualificationScript";

/**
 * Tapping Yes/No/Maybe for the six booking data points — the TEXT/BUTTON
 * (voiceless) flow. There is no microphone, no Vapi and no spoken answer: the
 * label IS the answer word, POSTed to the server-authoritative
 * qualification-status endpoint, which classifies and records it exactly as a
 * spoken reply once did. The tests that matter are the ones that catch it
 * quietly regressing — a label that does not classify, an answer sent twice,
 * or buttons appearing where there is no data point to answer.
 */

const t = (key: string, vars?: Record<string, string>) => (vars ? `${key}:${Object.values(vars).join("/")}` : key);

const classOf = (label: string): "YES" | "NO" | "MAYBE" =>
  label === "Yes" || label === "ஆம்" ? "YES" : label === "No" || label === "இல்லை" ? "NO" : "MAYBE";

/** One fetch mock covering BOTH the modal's availability GET and the
 * qualification answer POST. The POST records answers server-side
 * (idempotently, by question number) and returns the cumulative authoritative
 * array — exactly the shape the real route returns. */
function installFetchMock() {
  const recorded: Array<{ n: number; c: string; a: string }> = [];
  const postCalls: Array<{ questionNumber: number; answer: string; sessionId: string }> = [];
  global.fetch = jest.fn(async (url: string, init?: RequestInit) => {
    const u = String(url);
    if (u.includes("/qualification-status") && init?.method === "POST") {
      const body = JSON.parse(String(init.body));
      postCalls.push(body);
      if (!recorded.some((a) => a.n === body.questionNumber)) {
        recorded.push({ n: body.questionNumber, c: classOf(body.answer), a: body.answer });
      }
      return { ok: true, status: 200, json: async () => ({ answers: [...recorded], qualified: recorded.some((a) => a.n === 6), accepted: true }) };
    }
    // Availability GET (and anything else) — a successful empty response.
    return { ok: true, status: 200, json: async () => ({ configured: true, slots: [] }) };
  }) as unknown as typeof fetch;
  return { recorded, postCalls };
}

function props(language: "en" | "ta" = "en", extra: Record<string, unknown> = {}) {
  return {
    open: true,
    onClose: jest.fn(),
    companyId: "comp-1",
    employeeId: "emp-1",
    employeeName: "Srinivasan Kandasamy",
    companyName: "Pagalava",
    language: language as never,
    t,
    qualifyFirst: true,
    ...extra,
  };
}

async function renderQualification(language: "en" | "ta" = "en") {
  const result = render(<AppointmentModal {...props(language)} />);
  // Qualification only starts on the explicit Begin tap.
  await act(async () => {
    fireEvent.click(screen.getByTestId("start-qualification"));
  });
  return result;
}

const postCount = () =>
  (global.fetch as jest.Mock).mock.calls.filter((c) => String(c[0]).includes("/qualification-status") && c[1]?.method === "POST").length;

beforeEach(() => {
  jest.clearAllMocks();
  installFetchMock();
});

describe("quick reply labels", () => {
  it("offers Yes / No / Maybe in English", () => {
    expect(getQuickReplyOptions("en").map((o) => o.label)).toEqual(["Yes", "No", "Maybe"]);
  });

  it("offers ஆம் / இல்லை / இருந்தாலும் in Tamil", () => {
    expect(getQuickReplyOptions("ta").map((o) => o.label)).toEqual(["ஆம்", "இல்லை", "இருந்தாலும்"]);
  });

  it("sends a label the SERVER classifier already accepts — in both languages", () => {
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

describe("tapping an answer (voiceless — POSTed, not spoken)", () => {
  it("POSTs the English word (not a classification) for the active data point", async () => {
    await renderQualification("en");
    fireEvent.click(screen.getByTestId("quick-reply-yes"));
    await waitFor(() => expect(postCount()).toBe(1));
    const body = (global.fetch as jest.Mock).mock.calls.find((c) => c[1]?.method === "POST")![1];
    const parsed = JSON.parse(String(body.body));
    expect(parsed.answer).toBe("Yes");
    expect(parsed.questionNumber).toBe(1);
    expect(typeof parsed.sessionId).toBe("string");
    expect(parsed.sessionId.length).toBeGreaterThanOrEqual(8);
  });

  it("POSTs the Tamil word on a Tamil card", async () => {
    await renderQualification("ta");
    fireEvent.click(screen.getByTestId("quick-reply-no"));
    await waitFor(() => expect(postCount()).toBe(1));
    const parsed = JSON.parse(String((global.fetch as jest.Mock).mock.calls.find((c) => c[1]?.method === "POST")![1].body));
    expect(parsed.answer).toBe("இல்லை");
  });

  it("cannot answer the same data point twice, however many times it is tapped", async () => {
    await renderQualification("en");
    const yes = screen.getByTestId("quick-reply-yes");
    const no = screen.getByTestId("quick-reply-no");
    // Batched: a real double tap fires both clicks before React re-renders.
    act(() => {
      fireEvent.click(yes);
      fireEvent.click(yes);
      fireEvent.click(no);
    });
    await waitFor(() => expect(postCount()).toBe(1));
    // A single POST, carrying the first tap only.
    const parsed = JSON.parse(String((global.fetch as jest.Mock).mock.calls.find((c) => c[1]?.method === "POST")![1].body));
    expect(parsed.answer).toBe("Yes");
    expect(postCount()).toBe(1);
  });

  it("replaces the row with a processing indicator while the answer is in flight", async () => {
    await renderQualification("en");
    fireEvent.click(screen.getByTestId("quick-reply-yes"));
    // Synchronously after the tap (before the POST resolves) the options give
    // way to a processing state that belongs to the same data point.
    expect(screen.queryByTestId("quick-replies")).toBeNull();
    expect(screen.getByTestId("quick-reply-processing")).toBeInTheDocument();
  });

  it("advances to the next data point once the server records the answer", async () => {
    await renderQualification("en");
    const questions = getQualificationQuestions("en");
    expect(screen.getByTestId("current-question")).toHaveTextContent(questions[0].question);
    fireEvent.click(screen.getByTestId("quick-reply-yes"));
    await waitFor(() => expect(screen.getByTestId("current-question")).toHaveTextContent(questions[1].question));
    // The options are back for the fresh data point.
    expect(screen.getByTestId("quick-replies")).toBeInTheDocument();
  });

  it("releases the row so the visitor can retry when the answer POST fails", async () => {
    await renderQualification("en");
    // Make the answer POST fail.
    (global.fetch as jest.Mock).mockImplementation(async (url: string, init?: RequestInit) => {
      if (String(url).includes("/qualification-status") && init?.method === "POST") return { ok: false, status: 500, json: async () => ({}) };
      return { ok: true, status: 200, json: async () => ({ configured: true, slots: [] }) };
    });
    fireEvent.click(screen.getByTestId("quick-reply-yes"));
    // After the failure the honest error shows and the options return — not a
    // dead, greyed row.
    await waitFor(() => expect(screen.getByTestId("qual-answer-error")).toBeInTheDocument());
    expect(screen.getByTestId("quick-replies")).toBeInTheDocument();
  });
});

describe("where the options may appear", () => {
  it("not before the visitor has begun qualification", () => {
    render(<AppointmentModal {...props("en")} />);
    expect(screen.queryByTestId("quick-replies")).toBeNull();
    expect(screen.getByTestId("start-qualification")).toBeInTheDocument();
  });

  it("not when the modal is not in qualify-first mode — the plain booking path", () => {
    render(<AppointmentModal {...props("en", { qualifyFirst: undefined })} />);
    expect(screen.queryByTestId("quick-replies")).toBeNull();
    expect(screen.queryByTestId("start-qualification")).toBeNull();
  });

  it("shows a data point and its options together, in the qualification language", async () => {
    await renderQualification("ta");
    const group = screen.getByTestId("quick-replies");
    expect(group).toHaveAttribute("role", "group");
    expect(group).toHaveAccessibleName();
    expect(screen.getByTestId("current-question")).toHaveTextContent(getQualificationQuestions("ta")[0].question);
  });

  it("never starts a microphone or Vapi — the only network work is the answer POST", async () => {
    await renderQualification("en");
    fireEvent.click(screen.getByTestId("quick-reply-yes"));
    await waitFor(() => expect(postCount()).toBe(1));
    // Every fetch is same-origin GET availability or the qualification POST;
    // nothing hits a voice provider.
    const urls = (global.fetch as jest.Mock).mock.calls.map((c) => String(c[0]));
    expect(urls.some((u) => /vapi|daily|tts|audio/i.test(u))).toBe(false);
  });
});
