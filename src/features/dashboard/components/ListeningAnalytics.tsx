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
 *  - genuine play counts per type (Introduction / Elevator / Service / Why Us)
 *  - users who listened today and this week
 *  - per-visit-session breakdown
 *  - data points answered per lead (from the existing qualification record)
 *
 * Never invents users or counts; background prefetch is never recorded server
 * side, so it never appears here.
 */
interface ListenAnalytics {
  telemetryEnabled: boolean;
  totals: { todayUsers: number; weekUsers: number };
  byType: { intro: number; elevator: number; product: number; usp: number };
  perSession: Array<{ session: string; intro: number; elevator: number; product: number; usp: number; total: number; lastAt: string }>;
  dataPointsByLead: Array<{ lead: string; answered: number }>;
}

function Tile({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] px-4 py-3">
      <p className="text-2xl font-bold text-slate-100 tabular-nums">{value}</p>
      <p className="text-[11px] text-slate-400 mt-0.5">{label}</p>
    </div>
  );
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
              Listening telemetry is not active yet — counts populate once the analytics table is applied. Data points below are live.
            </p>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Tile label="Users who listened today" value={data.totals.todayUsers} />
            <Tile label="Users who listened this week" value={data.totals.weekUsers} />
          </div>

          <div className="space-y-1.5">
            <p className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Plays this week, by type</p>
            <ComparisonBars
              data={[
                { label: "Introduction", value: data.byType.intro },
                { label: "Elevator Pitch", value: data.byType.elevator },
                { label: "Service Pitch", value: data.byType.product },
                { label: "Why Us", value: data.byType.usp },
              ]}
              emptyMessage="No listening activity recorded yet."
            />
          </div>

          <div className="space-y-1.5">
            <p className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Per-visitor plays (recent sessions)</p>
            <ComparisonBars
              data={data.perSession.map((s) => ({ label: s.session, value: s.total, sublabel: `Intro ${s.intro} · Elev ${s.elevator} · Svc ${s.product} · Why ${s.usp}` }))}
              emptyMessage="No per-visitor plays yet."
            />
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
