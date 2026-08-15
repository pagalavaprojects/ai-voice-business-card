/**
 * @jest-environment jsdom
 *
 * The live-dashboard polling hook: single-flight, latest-wins, visibility
 * pause, and honest degradation (a failed refresh keeps the last snapshot
 * but declares it stale — it never zeroes data and never claims freshness).
 */
import "@testing-library/jest-dom";
import { act, renderHook } from "@testing-library/react";
import { useLivePoll } from "@/features/dashboard/hooks/useLivePoll";

const flush = async () => {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
};

describe("useLivePoll", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it("fetches immediately, reports live, and refreshes on the interval", async () => {
    let value = 1;
    const fetcher = jest.fn(async () => value);
    const { result } = renderHook(() => useLivePoll(fetcher, 10_000, true));

    await flush();
    expect(result.current.status).toBe("live");
    expect(result.current.data).toBe(1);

    value = 2;
    await act(async () => {
      jest.advanceTimersByTime(10_000);
    });
    await flush();
    expect(result.current.data).toBe(2);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("a failed refresh keeps the previous snapshot and declares it STALE — never zeroes, never claims live", async () => {
    let fail = false;
    const fetcher = jest.fn(async () => {
      if (fail) throw new Error("network down");
      return 42;
    });
    const { result } = renderHook(() => useLivePoll(fetcher, 10_000, true));
    await flush();
    expect(result.current.data).toBe(42);
    const updatedAt = result.current.lastUpdatedAt;

    fail = true;
    await act(async () => {
      jest.advanceTimersByTime(10_000);
    });
    await flush();
    expect(result.current.data).toBe(42);
    expect(result.current.status).toBe("stale");
    // Freshness must NOT advance on failure.
    expect(result.current.lastUpdatedAt).toBe(updatedAt);
  });

  it("a failure with no snapshot at all is ERROR, not an empty-looking dashboard", async () => {
    const fetcher = jest.fn(async () => {
      throw new Error("boom");
    });
    const { result } = renderHook(() => useLivePoll(fetcher, 10_000, true));
    await flush();
    expect(result.current.status).toBe("error");
    expect(result.current.data).toBeNull();
  });

  it("single-flight: a tick during an in-flight request is skipped, not stacked", async () => {
    let resolveFirst: ((v: number) => void) | null = null;
    const fetcher = jest.fn(
      () =>
        new Promise<number>((res) => {
          if (!resolveFirst) resolveFirst = res;
          else res(99);
        })
    );
    renderHook(() => useLivePoll(fetcher, 10_000, true));
    await flush();
    // Two ticks while the first request is still pending.
    await act(async () => {
      jest.advanceTimersByTime(20_000);
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    await act(async () => {
      resolveFirst!(1);
    });
  });

  it("pauses while the tab is hidden and refreshes immediately on return", async () => {
    const fetcher = jest.fn(async () => 7);
    renderHook(() => useLivePoll(fetcher, 10_000, true));
    await flush();
    expect(fetcher).toHaveBeenCalledTimes(1);

    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    await act(async () => {
      jest.advanceTimersByTime(30_000);
    });
    expect(fetcher).toHaveBeenCalledTimes(1); // no background hammering

    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await flush();
    expect(fetcher).toHaveBeenCalledTimes(2); // one immediate catch-up fetch
  });

  it("disabled hook never fetches", async () => {
    const fetcher = jest.fn(async () => 1);
    renderHook(() => useLivePoll(fetcher, 10_000, false));
    await flush();
    await act(async () => {
      jest.advanceTimersByTime(30_000);
    });
    expect(fetcher).not.toHaveBeenCalled();
  });
});
