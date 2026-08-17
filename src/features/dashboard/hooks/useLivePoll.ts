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
 * - Age-based staleness: "live" is a CLAIM about freshness, so it expires.
 *   If no refresh has SUCCEEDED within 3 poll intervals (a hung request, a
 *   suspended timer, anything), the status downgrades itself to "stale"
 *   without waiting for a failure to prove it.
 * - Failure backoff: consecutive failures stretch the retry gap
 *   (interval × 2^failures, capped at 8×) so a down API is probed gently,
 *   not hammered every tick. One success resets the cadence.
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
  const failuresRef = useRef(0);
  const lastAttemptAtRef = useRef(0);
  const lastSuccessAtRef = useRef(0);

  const run = useCallback(async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    lastAttemptAtRef.current = Date.now();
    const seq = ++seqRef.current;
    setStatus((s) => (hasDataRef.current ? "refreshing" : s === "error" ? "loading" : s));
    try {
      const result = await fetcherRef.current();
      if (seq !== seqRef.current) return;
      setData(result);
      hasDataRef.current = true;
      failuresRef.current = 0;
      lastSuccessAtRef.current = Date.now();
      setLastUpdatedAt(lastSuccessAtRef.current);
      setError(null);
      setStatus("live");
    } catch (err) {
      if (seq !== seqRef.current) return;
      failuresRef.current++;
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
      // Backoff: after N consecutive failures the next attempt waits
      // interval × min(2^N, 8) from the LAST attempt.
      if (failuresRef.current > 0) {
        const waitMs = intervalMs * Math.min(2 ** failuresRef.current, 8);
        if (Date.now() - lastAttemptAtRef.current < waitMs) return;
      }
      run();
    }, intervalMs);
    // The freshness sentinel: downgrade an expired "live" claim even when
    // no request has failed (e.g. a request hung in flight forever).
    const staleAfterMs = intervalMs * 3;
    const staleWatch = setInterval(() => {
      if (hasDataRef.current && lastSuccessAtRef.current > 0 && Date.now() - lastSuccessAtRef.current > staleAfterMs) {
        // "refreshing" counts too: a refresh that has hung past the
        // threshold is showing old data just the same.
        setStatus((s) => (s === "live" || s === "refreshing" ? "stale" : s));
      }
    }, intervalMs);
    const onVisible = () => {
      if (document.visibilityState === "visible") run();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      clearInterval(staleWatch);
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
