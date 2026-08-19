/**
 * @jest-environment jsdom
 *
 * Network discipline of the public card + booking modal (2026-08-19
 * performance round). Each test pins a defect that was MEASURED in
 * production before being fixed, or a §-mandated polling behavior:
 *
 * - the card API was fetched twice on every returning visit (?lang=<default>
 *   aborted, then ?lang=<stored> refetched ~450ms later — captured live as
 *   ERR_ABORTED + a second 200);
 * - fixed pitches were only ever generated synchronously on the visitor's
 *   click (21–80s of Gemini latency) — now warmed in the background after
 *   the card settles;
 * - qualification polling waited a full 3s interval before the FIRST status
 *   fetch, stacked requests on slow networks, kept full cadence during
 *   outages, and merely discarded (never aborted) in-flight work on close.
 */
import { render, screen, act } from "@testing-library/react";
import { PublicBusinessCard } from "@/features/voice/components/PublicBusinessCard";
import { AppointmentModal } from "@/features/voice/components/AppointmentModal";
import { fireEvent } from "@testing-library/react";

jest.mock("@/features/voice/hooks/useVapiSession", () => ({
  useVapiSession: () => ({
    voiceState: "idle",
    isMuted: false,
    messages: [],
    durationSeconds: 0,
    error: null,
    isPlayingIntro: false,
    isDemoMode: true,
    callId: null,
    startCall: jest.fn(),
    endCall: jest.fn(),
    toggleMute: jest.fn(),
  }),
}));

function cardResponse(language: string) {
  return {
    ok: true,
    status: 200,
    json: () =>
      Promise.resolve({
        company: { name: "Pagalava Data Analytics", website: "https://maylaanai.com", logoUrl: null },
        employee: { name: "Srinivasan Kandasamy", designation: "Founder", email: "s@pagalava.com", phone: "+911234567890", officeAddress: null, workingHours: null, avatarUrl: null },
        firstMessage: "Hello.",
        systemPrompt: "PROMPT",
        language,
        enabledLanguages: ["en", "ta", "hi", "kn", "te", "ml"],
        tools: [],
        serverUrl: "https://maylaanai.com/api/vapi/webhook",
      }),
  };
}

describe("PublicBusinessCard — exactly one card fetch, in the stored language", () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it("a returning visitor's mount issues ONE /api/public fetch, already carrying ?lang=<stored> — never a default-language fetch that gets aborted and refetched", async () => {
    window.localStorage.clear();
    window.localStorage.setItem("pagalava.language", "en");
    const fetchSpy = jest.fn((url: RequestInfo | URL) => Promise.resolve(cardResponse("en"))) as unknown as jest.Mock;
    global.fetch = fetchSpy as unknown as typeof fetch;

    render(<PublicBusinessCard companyId="comp-1" employeeId="emp-1" />);
    await screen.findByTestId("voice-mic-button");

    const cardCalls = fetchSpy.mock.calls.map((c) => String(c[0])).filter((u) => u.includes("/api/public/comp-1/emp-1?"));
    expect(cardCalls).toHaveLength(1);
    expect(cardCalls[0]).toContain("lang=en");
    // The platform default is Tamil — the old first-commit fetch would have
    // carried it. It must never be requested at all now.
    expect(fetchSpy.mock.calls.map((c) => String(c[0]))).not.toContainEqual(expect.stringContaining("?lang=ta"));
  });

  it("warms all three fixed pitches for the confirmed language in the background after the card settles — one attempt each, never before the idle delay", async () => {
    jest.useFakeTimers();
    window.localStorage.clear();
    window.localStorage.setItem("pagalava.language", "en");
    const fetchSpy = jest.fn(() => Promise.resolve(cardResponse("en"))) as unknown as jest.Mock;
    global.fetch = fetchSpy as unknown as typeof fetch;

    render(<PublicBusinessCard companyId="comp-1" employeeId="emp-1" />);
    await act(async () => {
      await jest.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByTestId("voice-mic-button")).toBeTruthy();

    const pitchCallsBefore = fetchSpy.mock.calls.map((c) => String(c[0])).filter((u) => u.includes("/pitch?"));
    expect(pitchCallsBefore).toHaveLength(0); // idle-scheduled, off the critical path

    await act(async () => {
      await jest.advanceTimersByTimeAsync(3000);
    });
    const pitchCalls = fetchSpy.mock.calls.map((c) => String(c[0])).filter((u) => u.includes("/pitch?"));
    expect(pitchCalls).toHaveLength(3);
    for (const type of ["elevator", "product", "usp"]) {
      expect(pitchCalls).toContainEqual(expect.stringContaining(`type=${type}`));
    }
    expect(pitchCalls.every((u) => u.includes("lang=en"))).toBe(true);

    // Idle time passing again must not re-warm — one prefetch per language.
    await act(async () => {
      await jest.advanceTimersByTimeAsync(10_000);
    });
    expect(fetchSpy.mock.calls.map((c) => String(c[0])).filter((u) => u.includes("/pitch?"))).toHaveLength(3);
  });
});

describe("AppointmentModal — qualification polling discipline", () => {
  const t = (key: string) => key;
  const baseProps = {
    open: true,
    onClose: jest.fn(),
    companyId: "c1",
    employeeId: "e1",
    employeeName: "Srinivasan",
    companyName: "Pagalava",
    language: "en" as const,
    t,
  };
  const voice = (callId = "call-1") => ({ voiceState: "listening", callId, startCall: jest.fn(), endCall: jest.fn(), messages: [] });

  function statusFetchMock(behavior: (u: string, init?: RequestInit) => Promise<unknown>) {
    return jest.fn((url: RequestInfo | URL, init?: RequestInit) => {
      const u = String(url);
      if (u.includes("qualification-status")) return behavior(u, init);
      return Promise.resolve({ ok: true, json: async () => ({ slots: [] }) });
    }) as unknown as jest.Mock;
  }

  const statusUrls = (spy: jest.Mock) => spy.mock.calls.map((c) => String(c[0])).filter((u) => u.includes("qualification-status"));

  afterEach(() => {
    jest.useRealTimers();
  });

  it("fires the FIRST status fetch immediately on becoming active — not after the first 3s interval", async () => {
    jest.useFakeTimers();
    const fetchSpy = statusFetchMock(() => Promise.resolve({ ok: true, json: async () => ({ qualified: false, answers: [] }) }));
    global.fetch = fetchSpy as unknown as typeof fetch;

    render(<AppointmentModal {...baseProps} voice={voice()} />);
    fireEvent.click(screen.getByTestId("start-qualification"));
    await act(async () => {
      await jest.advanceTimersByTimeAsync(0);
    });

    expect(statusUrls(fetchSpy)).toHaveLength(1);
  });

  it("single-flight: while one status request is still pending, interval ticks do not stack a second one", async () => {
    jest.useFakeTimers();
    // Never resolves — the worst-case slow network.
    const fetchSpy = statusFetchMock(() => new Promise(() => undefined));
    global.fetch = fetchSpy as unknown as typeof fetch;

    render(<AppointmentModal {...baseProps} voice={voice()} />);
    fireEvent.click(screen.getByTestId("start-qualification"));
    await act(async () => {
      await jest.advanceTimersByTimeAsync(9500); // immediate + 3 interval ticks elapse
    });

    expect(statusUrls(fetchSpy)).toHaveLength(1);
  });

  it("backs off after consecutive failures instead of hammering full cadence through an outage", async () => {
    jest.useFakeTimers();
    const fetchSpy = statusFetchMock(() => Promise.resolve({ ok: false, status: 500 }));
    global.fetch = fetchSpy as unknown as typeof fetch;

    render(<AppointmentModal {...baseProps} voice={voice()} />);
    fireEvent.click(screen.getByTestId("start-qualification"));
    // 12s of outage = immediate + ticks at 3/6/9/12s. Full cadence would be
    // 5 attempts; backoff (skip 1, then 3…) must make it strictly fewer.
    await act(async () => {
      await jest.advanceTimersByTimeAsync(12_000);
    });

    const attempts = statusUrls(fetchSpy).length;
    expect(attempts).toBeGreaterThanOrEqual(2); // still retrying — never gives up silently
    expect(attempts).toBeLessThan(5); // but no longer at full cadence
  });

  it("aborts the in-flight status request outright when the modal closes", async () => {
    jest.useFakeTimers();
    let inFlightSignal: AbortSignal | undefined;
    const fetchSpy = statusFetchMock((_u, init) => {
      inFlightSignal = init?.signal ?? undefined;
      return new Promise(() => undefined);
    });
    global.fetch = fetchSpy as unknown as typeof fetch;

    const { unmount } = render(<AppointmentModal {...baseProps} voice={voice()} />);
    fireEvent.click(screen.getByTestId("start-qualification"));
    await act(async () => {
      await jest.advanceTimersByTimeAsync(0);
    });
    expect(inFlightSignal).toBeInstanceOf(AbortSignal);
    expect(inFlightSignal!.aborted).toBe(false);

    unmount();
    expect(inFlightSignal!.aborted).toBe(true);
  });
});
