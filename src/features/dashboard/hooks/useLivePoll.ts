"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type LiveStatus = "loading" | "live" | "refreshing" | "stale" | "error";

export interface LivePollState<T> {
  data: T | null;
  status: LiveStatus;
  /** Wall-clock time of the last SUCCESSFUL fetch — drives "Updated Xs ago".
   * Null until the first success; never advanced by a failed refresh. */
  lastUpdatedAt: number | null;
  error: string | null;
  refresh: () => void;
}

/**
 * Visibility-aware polling for the live dashboard.
 *
 * - Single-flight: a tick that fires while a request is still in the air is
 *   skipped, never stacked.
 * - Sequence-guarded: only the LATEST issued request may apply its result,
 *   so a slow early response can never overwrite a newer snapshot.
 * - Visibility-aware: polling pauses while the tab is hidden and fires one
 *   immediate refresh when it becomes visible again — no background
 *   hammering, no stale view on return.
 * - Honest failure: a failed refresh keeps the last good snapshot but flips
 *   status to "stale" (data shown is old) — it never zeroes metrics and
 *   never silently pretends freshness. With no snapshot at all it is
 *   "error".
 */
export function useLivePoll<T>(fetcher: () => Promise<T>, intervalMs: number, enabled: boolean): LivePollState<T> {
  const [data, setData] = useState<T | null>(null);
  const [status, setStatus] = useState<LiveStatus>("loading");
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const inFlightRef = useRef(false);
  const seqRef = useRef(0);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const hasDataRef = useRef(false);

  const run = useCallback(async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    const seq = ++seqRef.current;
    setStatus((s) => (hasDataRef.current ? "refreshing" : s === "error" ? "loading" : s));
    try {
      const result = await fetcherRef.current();
      if (seq !== seqRef.current) return;
      setData(result);
      hasDataRef.current = true;
      setLastUpdatedAt(Date.now());
      setError(null);
      setStatus("live");
    } catch (err) {
      if (seq !== seqRef.current) return;
      setError(err instanceof Error ? err.message : "Refresh failed");
      setStatus(hasDataRef.current ? "stale" : "error");
    } finally {
      inFlightRef.current = false;
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    run();
    const timer = setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      run();
    }, intervalMs);
    const onVisible = () => {
      if (document.visibilityState === "visible") run();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      // Invalidate anything still in flight for this effect's lifetime —
      // seqRef is a monotonic counter (not a DOM node), so reading the
      // freshest value at cleanup time is exactly the intent here.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      seqRef.current++;
      inFlightRef.current = false;
    };
  }, [run, intervalMs, enabled]);

  return { data, status, lastUpdatedAt, error, refresh: run };
}
