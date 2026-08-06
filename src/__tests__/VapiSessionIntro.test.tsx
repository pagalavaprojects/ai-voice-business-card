/**
 * @jest-environment jsdom
 */
import { renderHook, act } from "@testing-library/react";

/**
 * Regression coverage for the scripted-welcome feature: a visitor must be
 * able to interrupt the opening line and skip straight to their question,
 * and the UI must know when the very first assistant utterance (the
 * greeting) is playing versus any later reply, so it can say
 * "Introducing {Company}…" for exactly that one utterance.
 */
type Handler = (...args: unknown[]) => void;

interface FakeVapiInstance {
  handlers: Record<string, Handler[]>;
  started: unknown[];
  emit(event: string, ...args: unknown[]): void;
}

// Defined inside the factory (not imported/referenced from module scope) so
// it isn't caught by the class's temporal dead zone when Jest hoists this
// mock above the rest of the file's declarations.
jest.mock("@vapi-ai/web", () => {
  const instances: FakeVapiInstance[] = [];

  class FakeVapi implements FakeVapiInstance {
    handlers: Record<string, Handler[]> = {};
    started: unknown[] = [];

    constructor() {
      instances.push(this);
    }

    on(event: string, handler: Handler) {
      (this.handlers[event] ??= []).push(handler);
      return this;
    }

    emit(event: string, ...args: unknown[]) {
      for (const h of this.handlers[event] ?? []) h(...args);
    }

    async start(config: unknown) {
      this.started.push(config);
      return null;
    }

    async stop() {}
    setMuted() {}
  }

  return { __esModule: true, default: FakeVapi, __instances: instances };
});

// Imported after the mock so both pick up the mocked module.
import { useVapiSession } from "@/features/voice/hooks/useVapiSession";
const { __instances: fakeVapiInstances } = jest.requireMock("@vapi-ai/web") as { __instances: FakeVapiInstance[] };

const REAL_KEY = "pk_test_5f8a2c9d3e1b4f6a";

function assistantMessage(text: string) {
  return { type: "transcript", transcriptType: "final", role: "assistant", transcript: text };
}

describe("useVapiSession — scripted intro tracking", () => {
  beforeEach(() => {
    fakeVapiInstances.length = 0;
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("enables firstMessageInterruptionsEnabled so a visitor can talk over the greeting", async () => {
    const { result } = renderHook(() =>
      useVapiSession({ companyId: "c1", employeeId: "e1", vapiPublicKey: REAL_KEY, firstMessage: "வணக்கம்." })
    );

    await act(async () => {
      await result.current.startCall();
    });

    const vapi = fakeVapiInstances[0];
    expect(vapi.started[0]).toMatchObject({ firstMessageInterruptionsEnabled: true });
  });

  it("marks isPlayingIntro true for the first assistant utterance, then false once it finishes", async () => {
    const { result } = renderHook(() => useVapiSession({ companyId: "c1", employeeId: "e1", vapiPublicKey: REAL_KEY }));
    const vapi = fakeVapiInstances[0];

    act(() => vapi.emit("call-start"));
    expect(result.current.isPlayingIntro).toBe(false);

    act(() => vapi.emit("message", assistantMessage("வணக்கம். Pagalava Data Analytics...")));
    expect(result.current.isPlayingIntro).toBe(true);

    act(() => jest.advanceTimersByTime(3000));
    expect(result.current.isPlayingIntro).toBe(false);
  });

  it("does not treat a later reply as the intro", async () => {
    const { result } = renderHook(() => useVapiSession({ companyId: "c1", employeeId: "e1", vapiPublicKey: REAL_KEY }));
    const vapi = fakeVapiInstances[0];

    act(() => vapi.emit("call-start"));
    act(() => vapi.emit("message", assistantMessage("வணக்கம்.")));
    act(() => jest.advanceTimersByTime(3000));
    expect(result.current.isPlayingIntro).toBe(false);

    // A visitor's question, then the model's reply — not the greeting.
    act(() => vapi.emit("message", assistantMessage("We help mid-sized companies with AI.")));
    expect(result.current.isPlayingIntro).toBe(false);
  });

  it("drops isPlayingIntro immediately when the visitor interrupts, rather than waiting out the timer", async () => {
    const { result } = renderHook(() => useVapiSession({ companyId: "c1", employeeId: "e1", vapiPublicKey: REAL_KEY }));
    const vapi = fakeVapiInstances[0];

    act(() => vapi.emit("call-start"));
    act(() => vapi.emit("message", assistantMessage("வணக்கம்.")));
    expect(result.current.isPlayingIntro).toBe(true);

    // The visitor starts talking over the greeting.
    act(() => vapi.emit("speech-start"));
    expect(result.current.isPlayingIntro).toBe(false);
  });

  it("plays the intro again on a fresh call-start, so a refresh or new session is unaffected", async () => {
    const { result } = renderHook(() => useVapiSession({ companyId: "c1", employeeId: "e1", vapiPublicKey: REAL_KEY }));
    const vapi = fakeVapiInstances[0];

    act(() => vapi.emit("call-start"));
    act(() => vapi.emit("message", assistantMessage("வணக்கம்.")));
    act(() => jest.advanceTimersByTime(3000));
    act(() => vapi.emit("call-end"));

    // A new session — the next call-start resets the "already played" flag.
    act(() => vapi.emit("call-start"));
    act(() => vapi.emit("message", assistantMessage("வணக்கம்.")));
    expect(result.current.isPlayingIntro).toBe(true);
  });
});
