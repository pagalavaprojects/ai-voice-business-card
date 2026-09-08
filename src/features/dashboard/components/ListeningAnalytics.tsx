"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Card } from "@/shared/ui/card";
import { Button } from "@/shared/ui/button";
import { apiFetch } from "@/shared/lib/apiClient";
import { useLivePoll } from "@/features/dashboard/hooks/useLivePoll";
import { ComparisonBars } from "@/features/dashboard/components/charts";

/**
 * Item 14 — Listening & Data Point analytics.
 *
 * `variant="full"` is the ONE simple page (/dashboard/listening): unique
 * listeners today / 7 days, a compact visual, per-user listening per clip
 * (Introduction, Replay, Elevator, Service, Why Us, Smart AI Lead) and
 * per-user data points DP1–DP6. `variant="summary"` is the compact block the
 * dashboards already show, linking to the page.
 *
 * ONE request per refresh (/api/user/listen-analytics), driven by the
 * existing useLivePoll (single-flight, latest-wins, visibility pause,
 * backoff) — no second polling framework. Only real, server-aggregated
 * values are shown; when the endpoint cannot read something it says so
 * instead of painting zeros.
 */
type Range = "today" | "7d";
type Classification = "YES" | "NO" | "MAYBE";
interface Plays {
  intro: number;
  replay: number;
  elevator: number;
  product: number;
  usp: number;
  smart: number;
  total: number;
}
interface UserRow {
  key: string;
  label: string;
  kind: "lead" | "visitor";
  leadId: string | null;
  email: string | null;
  plays: Plays;
  dataPoints: Array<Classification | null>;
  answered: number;
  completed: boolean;
  lastAt: string | null;
}
export interface ListenAnalytics {
  range: Range;
  windows: { todayStart: string; weekStart: string };
  listenStatus: "ok" | "not_applied" | "unavailable";
  leadStatus: "ok" | "unavailable";
  telemetryEnabled: boolean;
  totals: { todayUsers: number; weekUsers: number; todayPlays: number; weekPlays: number };
  byType: Plays;
  trend: Array<{ day: string; plays: number }>;
  users: UserRow[];
  usersTotal: number;
  appointments: { bookedWeek: number; bookedTotal: number; requestedTotal: number };
  definitions: { user: string; today: string; week: string; plays: string };
}

const REFRESH_MS = 30_000;
const CLIPS: Array<{ key: keyof Omit<Plays, "total">; label: string; short: string }> = [
  { key: "intro", label: "Introduction", short: "Intro" },
  { key: "replay", label: "Introduction replay", short: "Replay" },
  { key: "elevator", label: "Elevator Pitch", short: "Elevator" },
  { key: "product", label: "Service Pitch", short: "Service" },
  { key: "usp", label: "Why Us", short: "Why Us" },
  { key: "smart", label: "Smart AI Lead Business Card", short: "Smart AI Lead" },
];
const DP_LABEL: Record<Classification, string> = { YES: "Yes", NO: "No", MAYBE: "Maybe" };
const DP_CLASS: Record<Classification, string> = { YES: "text-emerald-300", NO: "text-rose-300", MAYBE: "text-amber-300" };

function localMidnightIso(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

/** "Mon 7 Sep" for a bucket's start instant (the viewer's local midnight),
 * formatted in the viewer's own zone; falls back to the raw value. */
function dayLabel(day: string): string {
  const d = new Date(day);
  return Number.isNaN(d.getTime()) ? day : d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
}

function Tile({ label, value, testId, hint }: { label: string; value: number | string; testId?: string; hint?: string }) {
  return (
    <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] px-4 py-3" data-testid={testId}>
      <p className="text-2xl font-bold text-slate-100 tabular-nums">{value}</p>
      <p className="text-[11px] text-slate-400 mt-0.5">{label}</p>
      {hint && <p className="text-[10px] text-slate-500 mt-0.5">{hint}</p>}
    </div>
  );
}

export function ListeningAnalytics({ variant = "summary" }: { variant?: "summary" | "full" }) {
  const [range, setRange] = useState<Range>("7d");
  const fetcher = useCallback(
    () => apiFetch<ListenAnalytics>(`/api/user/listen-analytics?range=${range}&todayStart=${encodeURIComponent(localMidnightIso())}`),
    [range]
  );
  const { data, status, error, refresh, lastUpdatedAt } = useLivePoll(fetcher, REFRESH_MS, true);

  // A range change re-fetches through the SAME poll (no second request
  // pipeline); the first mount is already fetched by the poll itself.
  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    void refresh();
  }, [range, refresh]);

  const full = variant === "full";
  const listenOk = data?.listenStatus === "ok";
  const num = (n: number) => (listenOk ? n : "—");
  const clipBars = data ? CLIPS.map((c) => ({ label: c.label, value: data.byType[c.key] })) : [];
  const rangeLabel = range === "today" ? "today" : "last 7 days";
  const statusText =
    status === "loading" ? "Loading…" : status === "refreshing" ? "Refreshing…" : status === "stale" ? "Showing earlier data" : status === "error" ? "Could not refresh" : lastUpdatedAt ? `Updated ${new Date(lastUpdatedAt).toLocaleTimeString()}` : "";

  const Heading = full ? "h1" : "h2";

  return (
    <Card className="glass-panel border-white/[0.08] p-4 sm:p-6 space-y-4" aria-labelledby="listen-analytics-heading">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <Heading id="listen-analytics-heading" className={full ? "text-lg font-bold text-slate-100" : "text-sm font-bold text-slate-100"}>
            {full ? "Listening & Data Point Analytics" : "Card Listening Analytics"}
          </Heading>
          <p className="text-[11px] text-slate-400" aria-live="polite">
            {statusText}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {full && (
            <div role="group" aria-label="Time range" className="inline-flex rounded-xl border border-white/[0.1] overflow-hidden">
              {(["today", "7d"] as Range[]).map((r) => (
                <button
                  key={r}
                  type="button"
                  aria-pressed={range === r}
                  onClick={() => setRange(r)}
                  className={`min-h-[44px] px-4 text-xs font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 ${range === r ? "bg-sky-500/20 text-sky-200" : "text-slate-300 hover:bg-white/[0.05]"}`}
                >
                  {r === "today" ? "Today" : "7 Days"}
                </button>
              ))}
            </div>
          )}
          <Button variant="outline" size="sm" onClick={() => void refresh()} className="text-xs min-h-[44px]" disabled={status === "loading" || status === "refreshing"}>
            Refresh
          </Button>
        </div>
      </div>

      {status === "error" && !data && (
        <p className="text-xs text-rose-300" role="status">
          Analytics temporarily unavailable{error ? ` — ${error}` : ""}.
        </p>
      )}

      {data && (
        <>
          {data.listenStatus === "not_applied" && (
            <p className="text-[11px] text-amber-300/90" role="status">
              Listening telemetry is not active — the analytics table is not applied. Data points below are live.
            </p>
          )}
          {data.listenStatus === "unavailable" && (
            <p className="text-[11px] text-rose-300" role="status">
              Listening data temporarily unavailable — counts are hidden rather than shown as zero.
            </p>
          )}
          {data.leadStatus === "unavailable" && (
            <p className="text-[11px] text-rose-300" role="status">
              Data-point records temporarily unavailable.
            </p>
          )}

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Tile label="Unique listeners today" value={num(data.totals.todayUsers)} testId="listen-today-users" hint="from your local midnight" />
            <Tile label="Unique listeners, 7 days" value={num(data.totals.weekUsers)} testId="listen-week-users" hint="last 7 local days" />
            <Tile label="Plays today" value={num(data.totals.todayPlays)} testId="listen-today-plays" />
            <Tile label="Plays, 7 days" value={num(data.totals.weekPlays)} testId="listen-week-plays" />
          </div>

          <div className={full ? "grid grid-cols-1 lg:grid-cols-2 gap-4" : "space-y-1.5"}>
            <div className="space-y-1.5">
              <p className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold" id="listen-by-content">
                Listening by content, {full ? rangeLabel : "last 7 days"}
              </p>
              {listenOk ? (
                <ComparisonBars data={clipBars} emptyMessage="No listening activity yet." />
              ) : (
                <p className="text-xs text-slate-500">Not available.</p>
              )}
            </div>
            {full && (
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <p className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Unique listeners: today vs 7 days</p>
                  {listenOk ? (
                    <ComparisonBars
                      data={[
                        { label: "Today", value: data.totals.todayUsers },
                        { label: "7 days", value: data.totals.weekUsers },
                      ]}
                      emptyMessage="No listeners yet."
                    />
                  ) : (
                    <p className="text-xs text-slate-500">Not available.</p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <p className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Plays per day, last 7 local days</p>
                  {listenOk ? (
                    <ComparisonBars data={data.trend.map((t) => ({ label: dayLabel(t.day), value: t.plays }))} emptyMessage="No plays in the last 7 days." />
                  ) : (
                    <p className="text-xs text-slate-500">Not available.</p>
                  )}
                </div>
              </div>
            )}
          </div>

          {full && (
            <>
              <section aria-labelledby="per-user-listening-heading" className="space-y-1.5">
                <h2 id="per-user-listening-heading" className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">
                  Per-user listening, {rangeLabel}
                </h2>
                {!listenOk ? (
                  <p className="text-xs text-slate-500">Not available.</p>
                ) : data.users.filter((u) => u.plays.total > 0).length === 0 ? (
                  <p className="text-xs text-slate-400" data-testid="listening-empty">
                    No listening activity yet.
                  </p>
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-white/[0.06]">
                    <table className="min-w-full text-xs" data-testid="per-user-listening">
                      <caption className="sr-only">Genuine plays per user and clip, {rangeLabel}</caption>
                      <thead className="bg-white/[0.03] text-slate-400">
                        <tr>
                          <th scope="col" className="text-left px-3 py-2 font-semibold">
                            User
                          </th>
                          {CLIPS.map((c) => (
                            <th key={c.key} scope="col" className="text-right px-3 py-2 font-semibold whitespace-nowrap">
                              {c.short}
                            </th>
                          ))}
                          <th scope="col" className="text-right px-3 py-2 font-semibold">
                            Total
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/[0.06] text-slate-200">
                        {data.users
                          .filter((u) => u.plays.total > 0)
                          .map((u) => (
                            <tr key={u.key} data-testid={`listen-user-${u.key}`}>
                              <th scope="row" className="text-left px-3 py-2 font-medium whitespace-nowrap">
                                {u.label}
                                {u.kind === "visitor" && <span className="ml-1 text-[10px] text-slate-500">(not yet identified)</span>}
                              </th>
                              {CLIPS.map((c) => (
                                <td key={c.key} className="text-right px-3 py-2 tabular-nums">
                                  {u.plays[c.key]}
                                </td>
                              ))}
                              <td className="text-right px-3 py-2 tabular-nums font-semibold">{u.plays.total}</td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>

              <section aria-labelledby="per-user-datapoints-heading" className="space-y-1.5">
                <h2 id="per-user-datapoints-heading" className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">
                  Per-user data points, {rangeLabel}
                </h2>
                {data.users.filter((u) => u.answered > 0).length === 0 ? (
                  <p className="text-xs text-slate-400" data-testid="datapoints-empty">
                    No data points answered yet.
                  </p>
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-white/[0.06]">
                    <table className="min-w-full text-xs" data-testid="per-user-datapoints">
                      <caption className="sr-only">Persisted answers per user for data points 1 to 6, {rangeLabel}</caption>
                      <thead className="bg-white/[0.03] text-slate-400">
                        <tr>
                          <th scope="col" className="text-left px-3 py-2 font-semibold">
                            User
                          </th>
                          {[1, 2, 3, 4, 5, 6].map((n) => (
                            <th key={n} scope="col" className="text-center px-3 py-2 font-semibold whitespace-nowrap">
                              DP{n}
                            </th>
                          ))}
                          <th scope="col" className="text-right px-3 py-2 font-semibold whitespace-nowrap">
                            Answered
                          </th>
                          <th scope="col" className="text-right px-3 py-2 font-semibold">
                            Completed
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/[0.06] text-slate-200">
                        {data.users
                          .filter((u) => u.answered > 0)
                          .map((u) => (
                            <tr key={u.key} data-testid={`dp-user-${u.key}`}>
                              <th scope="row" className="text-left px-3 py-2 font-medium whitespace-nowrap">
                                {u.label}
                              </th>
                              {u.dataPoints.map((c, i) => (
                                <td key={i} className={`text-center px-3 py-2 ${c ? DP_CLASS[c] : "text-slate-600"}`}>
                                  {c ? DP_LABEL[c] : "—"}
                                </td>
                              ))}
                              <td className="text-right px-3 py-2 tabular-nums">{u.answered} / 6</td>
                              <td className="text-right px-3 py-2">{u.completed ? "Yes" : "No"}</td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>

              <p className="text-[10px] text-slate-500 leading-relaxed">
                {data.definitions.user} {data.definitions.week} {data.definitions.plays}
                {data.usersTotal > data.users.length ? ` Showing the ${data.users.length} most active of ${data.usersTotal} users.` : ""}
              </p>
            </>
          )}

          {!full && (
            <>
              <div className="grid grid-cols-3 gap-3">
                <Tile label="Appointments booked (7 days)" value={data.appointments.bookedWeek} testId="appointments-booked-week" />
                <Tile label="Appointments booked (all time)" value={data.appointments.bookedTotal} testId="appointments-booked-total" />
                <Tile label="Awaiting confirmation" value={data.appointments.requestedTotal} testId="appointments-requested-total" />
              </div>
              <Link href="/dashboard/listening" className="inline-block text-xs font-semibold text-sky-300 hover:text-sky-200 underline min-h-[44px] leading-[44px]">
                Open per-user listening &amp; data points →
              </Link>
            </>
          )}
        </>
      )}
    </Card>
  );
}
