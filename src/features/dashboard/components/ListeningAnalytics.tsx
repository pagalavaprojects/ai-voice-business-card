"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Card } from "@/shared/ui/card";
import { Button } from "@/shared/ui/button";
import { apiFetch } from "@/shared/lib/apiClient";
import { ComparisonBars } from "@/features/dashboard/components/charts";

/**
 * Per-user card-listening analytics (requirement 14) — a self-contained
 * section on the existing dashboard. It fetches /api/user/listen-analytics
 * independently of the main dashboard poll (so it can never destabilise the
 * primary numbers) and shows ONLY real DB-derived data:
 *  - users who listened today / this week, plays today / this week
 *  - a 7-day daily play trend
 *  - genuine play counts per clip (Introduction, Introduction replays,
 *    Elevator, Service, Why Us, Smart AI Lead)
 *  - per-visit-session breakdown
 *  - data points answered per lead (from the existing qualification record)
 *  - appointments booked (confirmed) and requested
 *
 * Never invents users or counts; background prefetch is never recorded server
 * side, so it never appears here.
 */
interface ListenAnalytics {
  telemetryEnabled: boolean;
  totals: { todayUsers: number; weekUsers: number; todayPlays: number; weekPlays: number };
  byType: { intro: number; replay: number; elevator: number; product: number; usp: number; smart: number };
  trend: Array<{ day: string; plays: number }>;
  perSession: Array<{ session: string; intro: number; replay: number; elevator: number; product: number; usp: number; smart: number; total: number; lastAt: string }>;
  dataPointsByLead: Array<{ lead: string; answered: number }>;
  appointments: { bookedWeek: number; bookedTotal: number; requestedTotal: number };
}

function Tile({ label, value, testId }: { label: string; value: number; testId?: string }) {
  return (
    <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] px-4 py-3" data-testid={testId}>
      <p className="text-2xl font-bold text-slate-100 tabular-nums">{value}</p>
      <p className="text-[11px] text-slate-400 mt-0.5">{label}</p>
    </div>
  );
}

/** "Mon 7 Sep" for a bucket's start instant (the viewer's local midnight),
 * formatted in the viewer's own zone; falls back to the raw value. */
function dayLabel(day: string): string {
  const d = new Date(day);
  return Number.isNaN(d.getTime()) ? day : d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
}

export function ListeningAnalytics() {
  const [data, setData] = useState<ListenAnalytics | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  const load = useCallback(async () => {
    setState("loading");
    try {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const d = await apiFetch<ListenAnalytics>(`/api/user/listen-analytics?todayStart=${encodeURIComponent(todayStart.toISOString())}`);
      setData(d);
      setState("ready");
    } catch {
      setState("error");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <Card className="glass-panel border-white/[0.08] p-6 space-y-4" aria-labelledby="listen-analytics-heading">
      <div className="flex items-center justify-between gap-2">
        <h2 id="listen-analytics-heading" className="text-sm font-bold text-slate-100">
          Card Listening Analytics
        </h2>
        <Button variant="outline" size="sm" onClick={load} className="text-xs" disabled={state === "loading"}>
          {state === "loading" ? "Refreshing…" : "Refresh"}
        </Button>
      </div>

      {state === "error" && <p className="text-xs text-rose-300">Could not load listening analytics.</p>}

      {state !== "error" && data && (
        <>
          {!data.telemetryEnabled && (
            <p className="text-[11px] text-amber-300/90">
              Listening telemetry is not active yet — counts populate once the analytics table is applied. Data points and appointments below are live.
            </p>
          )}

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Tile label="Users who listened today" value={data.totals.todayUsers} testId="listen-today-users" />
            <Tile label="Users who listened this week" value={data.totals.weekUsers} testId="listen-week-users" />
            <Tile label="Plays today" value={data.totals.todayPlays} testId="listen-today-plays" />
            <Tile label="Plays this week" value={data.totals.weekPlays} testId="listen-week-plays" />
          </div>

          <div className="space-y-1.5">
            <p className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Plays per day, last 7 days</p>
            <ComparisonBars data={data.trend.map((t) => ({ label: dayLabel(t.day), value: t.plays }))} emptyMessage="No plays in the last 7 days." />
          </div>

          <div className="space-y-1.5">
            <p className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Plays this week, by clip</p>
            <ComparisonBars
              data={[
                { label: "Introduction", value: data.byType.intro },
                { label: "Introduction replays", value: data.byType.replay },
                { label: "Elevator Pitch", value: data.byType.elevator },
                { label: "Service Pitch", value: data.byType.product },
                { label: "Why Us", value: data.byType.usp },
                { label: "Smart AI Lead Business Card", value: data.byType.smart },
              ]}
              emptyMessage="No listening activity recorded yet."
            />
          </div>

          <div className="space-y-1.5">
            <p className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Per-visitor plays (recent sessions)</p>
            <ComparisonBars
              data={data.perSession.map((s) => ({
                label: s.session,
                value: s.total,
                sublabel: `Intro ${s.intro} · Replay ${s.replay} · Elev ${s.elevator} · Svc ${s.product} · Why ${s.usp} · Smart ${s.smart}`,
              }))}
              emptyMessage="No per-visitor plays yet."
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <Tile label="Appointments booked (7 days)" value={data.appointments.bookedWeek} testId="appointments-booked-week" />
            <Tile label="Appointments booked (all time)" value={data.appointments.bookedTotal} testId="appointments-booked-total" />
            <Tile label="Awaiting confirmation" value={data.appointments.requestedTotal} testId="appointments-requested-total" />
          </div>

          <div className="space-y-1.5">
            <p className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Data points answered, per lead</p>
            <ComparisonBars
              data={data.dataPointsByLead.map((d) => ({ label: d.lead, value: d.answered, sublabel: "of 6" }))}
              emptyMessage="No qualification data points answered yet."
            />
          </div>
        </>
      )}
    </Card>
  );
}
