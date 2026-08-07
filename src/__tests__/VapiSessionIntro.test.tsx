/**
 * @jest-environment jsdom
 */
import { renderHook, act } from "@testing-library/react";

/**
 * Regression coverage for the scripted-welcome feature. As of the
 * "professional AI receptionist" revision, the opening line must play to
 * completion, uninterrupted — the opposite of an earlier version of this
 * feature that let a visitor talk over it — and the UI must know when the
 * very first assistant utterance (the greeting) is playing versus any later
 * reply, so it can say "Introducing {Company}…" for exactly that one
 * utterance.
 */
type Handler = (...args: unknown[]) => void;

interface FakeVapiInstance {
  handlers: Record<string, Handler[]>;
  started: unknown[];
  muteCalls: boolean[];
  stopCalls: number;
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
    muteCalls: boolean[] = [];
    stopCalls = 0;

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

    async stop() {
      this.stopCalls += 1;
    }
    setMuted(mute: boolean) {
      this.muteCalls.push(mute);
    }
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

  it("disables firstMessageInterruptionsEnabled so the scripted opening cannot be barged in on", async () => {
    const { result } = renderHook(() =>
      useVapiSession({ companyId: "c1", employeeId: "e1", vapiPublicKey: REAL_KEY, firstMessage: "வணக்கம்." })
    );

    await act(async () => {
      await result.current.startCall();
    });

    const vapi = fakeVapiInstances[0];
    expect(vapi.started[0]).toMatchObject({ firstMessageInterruptionsEnabled: false });
  });

  it("sets a Deepgram transcriber for the given speechLocale", async () => {
    const { result } = renderHook(() =>
      useVapiSession({ companyId: "c1", employeeId: "e1", vapiPublicKey: REAL_KEY, speechLocale: "ta" })
    );

    await act(async () => {
      await result.current.startCall();
    });

    const vapi = fakeVapiInstances[0];
    expect(vapi.started[0]).toMatchObject({ transcriber: { provider: "deepgram", language: "ta" } });
  });

  it("omits the transcriber field entirely when no speechLocale is given — zero regression for existing callers", async () => {
    const { result } = renderHook(() => useVapiSession({ companyId: "c1", employeeId: "e1", vapiPublicKey: REAL_KEY }));

    await act(async () => {
      await result.current.startCall();
    });

    const vapi = fakeVapiInstances[0];
    expect(vapi.started[0]).not.toHaveProperty("transcriber");
  });

  it("defaults to OpenAI when no voiceProvider is passed — zero regression for existing calls", async () => {
    const { result } = renderHook(() => useVapiSession({ companyId: "c1", employeeId: "e1", vapiPublicKey: REAL_KEY, voiceId: "shimmer" }));

    await act(async () => {
      await result.current.startCall();
    });

    const vapi = fakeVapiInstances[0];
    expect(vapi.started[0]).toMatchObject({ voice: { provider: "openai", voiceId: "shimmer", model: "tts-1-hd" } });
  });

  it("reports isDemoMode when no real key is configured, so callers can skip auto-start in demo mode", () => {
    const { result } = renderHook(() => useVapiSession({ companyId: "c1", employeeId: "e1", vapiPublicKey: "demo-vapi-key" }));
    expect(result.current.isDemoMode).toBe(true);
  });

  it("reports isDemoMode false for a real key, so auto-start is not skipped in production", () => {
    const { result } = renderHook(() => useVapiSession({ companyId: "c1", employeeId: "e1", vapiPublicKey: REAL_KEY }));
    expect(result.current.isDemoMode).toBe(false);
  });

  it("switches to ElevenLabs when the server-resolved voiceProvider says so", async () => {
    const { result } = renderHook(() =>
      useVapiSession({
        companyId: "c1",
        employeeId: "e1",
        vapiPublicKey: REAL_KEY,
        voiceId: "tamil-voice-id-abc123",
        voiceProvider: "11labs",
        voiceModel: "eleven_multilingual_v2",
      })
    );

    await act(async () => {
      await result.current.startCall();
    });

    const vapi = fakeVapiInstances[0];
    expect(vapi.started[0]).toMatchObject({
      voice: { provider: "11labs", voiceId: "tamil-voice-id-abc123", model: "eleven_multilingual_v2" },
    });
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

  it("ignores speech-start during the intro instead of treating it as an interruption", async () => {
    const { result } = renderHook(() => useVapiSession({ companyId: "c1", employeeId: "e1", vapiPublicKey: REAL_KEY }));
    const vapi = fakeVapiInstances[0];

    act(() => vapi.emit("call-start"));
    act(() => vapi.emit("message", assistantMessage("வணக்கம்.")));
    expect(result.current.isPlayingIntro).toBe(true);

    // Even if audio somehow reached Vapi's ASR during the intro (the mic is
    // force-muted, so this shouldn't happen in practice), speech-start must
    // not cut the greeting short.
    act(() => vapi.emit("speech-start"));
    expect(result.current.isPlayingIntro).toBe(true);
    expect(result.current.voiceState).toBe("speaking");

    // Only the intro's own completion timer ends it.
    act(() => jest.advanceTimersByTime(3000));
    expect(result.current.isPlayingIntro).toBe(false);
  });

  it("force-mutes the mic at call-start and unmutes only once the intro finishes", async () => {
    const { result } = renderHook(() => useVapiSession({ companyId: "c1", employeeId: "e1", vapiPublicKey: REAL_KEY }));
    const vapi = fakeVapiInstances[0];

    act(() => vapi.emit("call-start"));
    expect(vapi.muteCalls).toEqual([true]);

    act(() => vapi.emit("message", assistantMessage("வணக்கம்.")));
    expect(vapi.muteCalls).toEqual([true]); // still muted mid-intro

    act(() => jest.advanceTimersByTime(3000));
    expect(vapi.muteCalls).toEqual([true, false]); // unmuted once the intro completes
  });

  it("does not re-mute for a later reply, only for the intro", async () => {
    const { result } = renderHook(() => useVapiSession({ companyId: "c1", employeeId: "e1", vapiPublicKey: REAL_KEY }));
    const vapi = fakeVapiInstances[0];

    act(() => vapi.emit("call-start"));
    act(() => vapi.emit("message", assistantMessage("வணக்கம்.")));
    act(() => jest.advanceTimersByTime(3000));
    expect(vapi.muteCalls).toEqual([true, false]);

    act(() => vapi.emit("message", assistantMessage("We help mid-sized companies with AI.")));
    act(() => jest.advanceTimersByTime(3000));
    expect(vapi.muteCalls).toEqual([true, false]); // unchanged — no further mute/unmute calls
    void result;
  });

  it("refuses to start a second session while one is already active", async () => {
    const { result } = renderHook(() => useVapiSession({ companyId: "c1", employeeId: "e1", vapiPublicKey: REAL_KEY }));

    await act(async () => {
      await result.current.startCall();
    });
    await act(async () => {
      await result.current.startCall();
    });

    expect(fakeVapiInstances[0].started.length).toBe(1);
  });

  it("attempts exactly one automatic reconnect after an unexpected drop", async () => {
    const { result } = renderHook(() => useVapiSession({ companyId: "c1", employeeId: "e1", vapiPublicKey: REAL_KEY }));

    await act(async () => {
      await result.current.startCall();
    });
    const vapi = fakeVapiInstances[0];
    expect(vapi.started.length).toBe(1);

    act(() => vapi.emit("error", new Error("WebRTC connection lost")));
    expect(result.current.voiceState).toBe("idle");

    await act(async () => {
      jest.advanceTimersByTime(1500);
      await Promise.resolve();
    });
    expect(vapi.started.length).toBe(2);

    // A second drop must not trigger a second reconnect for the same session.
    act(() => vapi.emit("error", new Error("WebRTC connection lost again")));
    await act(async () => {
      jest.advanceTimersByTime(1500);
      await Promise.resolve();
    });
    expect(vapi.started.length).toBe(2);
  });

  it("never reconnects a call the visitor deliberately ended", async () => {
    const { result } = renderHook(() => useVapiSession({ companyId: "c1", employeeId: "e1", vapiPublicKey: REAL_KEY }));

    await act(async () => {
      await result.current.startCall();
    });
    const vapi = fakeVapiInstances[0];

    act(() => result.current.endCall());
    act(() => vapi.emit("error", new Error("connection torn down by stop()")));

    await act(async () => {
      jest.advanceTimersByTime(1500);
      await Promise.resolve();
    });
    expect(vapi.started.length).toBe(1);
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
