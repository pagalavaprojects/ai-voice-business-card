"use client";

import React, { useCallback, useEffect, useState } from "react";
import { MessageSquare, Users, TrendingUp, Clock, Mic, Loader2, Info } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/shared/ui/card";
import { useCompany } from "@/features/dashboard/context/CompanyContext";
import { apiFetch, ApiClientError } from "@/shared/lib/apiClient";
import { CallVolumeChart, FunnelChart, ComparisonBars, OutcomeSplit } from "@/features/dashboard/components/charts";

interface Analytics {
  windowDays: number;
  totalConversations: number;
  totalLeads: number;
  qualifiedLeads: number;
  conversionPercent: number | null;
  avgDurationSeconds: number | null;
  totalVoiceMinutes: number;
  successRatePercent: number | null;
  failedCalls: number;
  completedCalls: number;
  callsPerDay: Array<{ key: string; calls: number }>;
  callsPerWeek: Array<{ key: string; calls: number }>;
  callsPerMonth: Array<{ key: string; calls: number }>;
  leadFunnel: Array<{ stage: string; count: number }>;
  appointmentFunnel: Array<{ stage: string; count: number }>;
  employeePerformance: Array<{
    employeeId: string;
    name: string;
    designation: string;
    calls: number;
    leads: number;
    qualified: number;
    avgDurationSeconds: number | null;
    conversionPercent: number | null;
  }>;
  toolUsage: Array<{ tool: string; count: number }>;
  unavailableMetrics: Array<{ metric: string; reason: string }>;
}

const RANGES = [
  { days: 7, label: "7 days" },
  { days: 30, label: "30 days" },
  { days: 90, label: "90 days" },
];

function formatDuration(seconds: number | null): string {
  if (seconds === null) return "—";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

export default function AnalyticsPage() {
  const { activeCompanyId, loading: companyLoading } = useCompany();
  const [data, setData] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState(30);
  const [period, setPeriod] = useState<"day" | "week" | "month">("day");

  const fetchAnalytics = useCallback(async () => {
    if (!activeCompanyId) return;
    setLoading(true);
    setError(null);
    try {
      setData(await apiFetch<Analytics>(`/api/admin/analytics?companyId=${activeCompanyId}&days=${days}`));
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Failed to load analytics");
    } finally {
      setLoading(false);
    }
  }, [activeCompanyId, days]);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  if (companyLoading) return <div className="text-sm text-slate-400">Loading workspace…</div>;
  if (!activeCompanyId) return <div className="text-sm text-slate-400">No company selected.</div>;

  const series = data ? (period === "day" ? data.callsPerDay : period === "week" ? data.callsPerWeek : data.callsPerMonth) : [];

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 tracking-tight">Analytics</h1>
          <p className="text-xs text-slate-400">Computed from your own conversations, leads and appointments.</p>
        </div>
        {/* Filters sit in one row above the charts. */}
        <div className="flex gap-1.5" role="group" aria-label="Time range">
          {RANGES.map((r) => (
            <button
              key={r.days}
              type="button"
              onClick={() => setDays(r.days)}
              aria-pressed={days === r.days}
              className={`text-xs px-3 py-1.5 rounded-lg border transition-colors focus:outline-none focus:ring-2 focus:ring-sky-500 ${
                days === r.days
                  ? "bg-sky-500/15 border-sky-400/40 text-sky-300 font-semibold"
                  : "bg-white/[0.04] border-white/[0.08] text-slate-300 hover:bg-white/[0.07]"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div role="alert" className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-slate-400" role="status" aria-live="polite">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          Loading analytics…
        </div>
      ) : data ? (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            <Stat title="Conversations" value={String(data.totalConversations)} icon={<MessageSquare className="h-4 w-4 text-sky-400" />} sub={`Last ${data.windowDays} days`} />
            <Stat title="Leads" value={String(data.totalLeads)} icon={<Users className="h-4 w-4 text-emerald-400" />} sub={`${data.qualifiedLeads} qualified`} />
            <Stat
              title="Conversion"
              value={data.conversionPercent === null ? "—" : `${data.conversionPercent}%`}
              icon={<TrendingUp className="h-4 w-4 text-indigo-400" />}
              sub={data.conversionPercent === null ? "No calls yet" : "Calls that produced a lead"}
            />
            <Stat title="Avg Duration" value={formatDuration(data.avgDurationSeconds)} icon={<Clock className="h-4 w-4 text-amber-400" />} sub="Per completed call" />
            <Stat title="Voice Usage" value={`${data.totalVoiceMinutes}m`} icon={<Mic className="h-4 w-4 text-sky-400" />} sub="Total talk time" />
          </div>

          <Card className="glass-panel border-white/[0.08] p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-bold text-slate-100">Call volume</h2>
              <div className="flex gap-1.5" role="group" aria-label="Grouping">
                {(["day", "week", "month"] as const).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPeriod(p)}
                    aria-pressed={period === p}
                    className={`text-[11px] px-2.5 py-1 rounded-md border capitalize transition-colors focus:outline-none focus:ring-2 focus:ring-sky-500 ${
                      period === p ? "bg-sky-500/15 border-sky-400/40 text-sky-300" : "bg-white/[0.04] border-white/[0.08] text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
            <CallVolumeChart data={series} />
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="glass-panel border-white/[0.08] p-6">
              <h2 className="text-sm font-bold text-slate-100 mb-4">Lead funnel</h2>
              <FunnelChart data={data.leadFunnel} emptyMessage="No leads captured in this period." />
            </Card>

            <Card className="glass-panel border-white/[0.08] p-6">
              <h2 className="text-sm font-bold text-slate-100 mb-4">Appointment funnel</h2>
              <FunnelChart data={data.appointmentFunnel} emptyMessage="No appointments in this period." />
            </Card>

            <Card className="glass-panel border-white/[0.08] p-6">
              <h2 className="text-sm font-bold text-slate-100 mb-1">Call outcomes</h2>
              <p className="text-[11px] text-slate-400 mb-4">
                {data.successRatePercent === null ? "No completed calls to score yet." : `${data.successRatePercent}% success rate`}
              </p>
              <OutcomeSplit completed={data.completedCalls} failed={data.failedCalls} />
            </Card>

            <Card className="glass-panel border-white/[0.08] p-6">
              <h2 className="text-sm font-bold text-slate-100 mb-4">What visitors asked for</h2>
              <ComparisonBars
                data={data.toolUsage.map((t) => ({ label: t.tool, value: t.count }))}
                emptyMessage="No tools have been used during calls yet."
              />
            </Card>
          </div>

          <Card className="glass-panel border-white/[0.08] p-6">
            <h2 className="text-sm font-bold text-slate-100 mb-4">Employee performance</h2>
            {data.employeePerformance.length === 0 ? (
              <p className="text-xs text-slate-500">No employees configured yet.</p>
            ) : (
              <>
                <ComparisonBars
                  data={data.employeePerformance.map((e) => ({
                    label: e.name,
                    sublabel: e.designation,
                    value: e.calls,
                  }))}
                  emptyMessage="No calls recorded for any employee yet."
                  valueSuffix=" calls"
                />
                {/* Table view alongside the chart: identity and value never
                    depend on reading a bar, and this is the accessible route
                    to the same numbers. */}
                <div className="overflow-x-auto mt-5 pt-4 border-t border-white/[0.06]">
                  <table className="w-full text-left text-xs">
                    <thead className="text-[10px] uppercase tracking-wider text-slate-400">
                      <tr>
                        <th scope="col" className="pb-2 font-semibold">Employee</th>
                        <th scope="col" className="pb-2 font-semibold text-right">Calls</th>
                        <th scope="col" className="pb-2 font-semibold text-right">Leads</th>
                        <th scope="col" className="pb-2 font-semibold text-right">Qualified</th>
                        <th scope="col" className="pb-2 font-semibold text-right">Conv.</th>
                        <th scope="col" className="pb-2 font-semibold text-right">Avg</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.06] text-slate-300">
                      {data.employeePerformance.map((e) => (
                        <tr key={e.employeeId}>
                          <td className="py-2 text-slate-100 font-medium">{e.name}</td>
                          <td className="py-2 text-right font-mono tabular-nums">{e.calls}</td>
                          <td className="py-2 text-right font-mono tabular-nums">{e.leads}</td>
                          <td className="py-2 text-right font-mono tabular-nums">{e.qualified}</td>
                          <td className="py-2 text-right font-mono tabular-nums">{e.conversionPercent === null ? "—" : `${e.conversionPercent}%`}</td>
                          <td className="py-2 text-right font-mono tabular-nums">{formatDuration(e.avgDurationSeconds)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </Card>

          {/* Stating what isn't measured beats rendering an empty chart that
              looks like a bug, and beats inventing a number outright. */}
          {data.unavailableMetrics.length > 0 && (
            <Card className="glass-panel border-white/[0.08] p-5">
              <div className="flex items-start gap-2.5">
                <Info className="h-4 w-4 text-slate-400 shrink-0 mt-0.5" aria-hidden="true" />
                <div>
                  <h2 className="text-xs font-bold text-slate-200 mb-2">Not measured yet</h2>
                  <ul className="space-y-1.5">
                    {data.unavailableMetrics.map((m) => (
                      <li key={m.metric} className="text-[11px] text-slate-400">
                        <span className="text-slate-300 font-medium">{m.metric}</span> — {m.reason}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </Card>
          )}
        </>
      ) : null}
    </div>
  );
}

function Stat({ title, value, icon, sub }: { title: string; value: string; icon: React.ReactNode; sub: string }) {
  return (
    <Card className="glass-panel border-white/[0.08]">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-xs font-semibold text-slate-400">{title}</CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-extrabold text-slate-100 font-mono">{value}</div>
        <p className="text-[11px] text-slate-400 font-medium mt-1">{sub}</p>
      </CardContent>
    </Card>
  );
}
