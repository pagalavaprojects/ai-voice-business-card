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
  qualificationStarted: number;
  qualificationCompleted: number;
  appointmentsBooked: number;
  definedConversion: { definition: string; numerator: number; denominator: number; percent: number | null };
  minutesPerDay: Array<{ key: string; calls: number }>;
  qualificationsPerDay: Array<{ key: string; calls: number }>;
  bookingsPerDay: Array<{ key: string; calls: number }>;
  whatsappActivity: { inboundConversations: number; remindersSent: number; note: string };
  providerHealth: { database: string; vapi: string; whatsapp: string; whatsappTemplate: string; calendar: string; tts: string; note: string };
  recentActivity: {
    conversations: Array<{ id: string; createdAt: string; durationSeconds: number | null; channel: string; intent: string | null }>;
    qualifications: Array<{ id: string; name: string; createdAt: string }>;
    bookings: Array<{ id: string; status: string; startTime: string; createdAt: string }>;
  };
  unavailableMetrics: Array<{ metric: string; reason: string }>;
}

const RANGES = [
  { days: 1, label: "Today" },
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
            <Stat title="AI Voice Minutes" value={`${data.totalVoiceMinutes}m`} icon={<Mic className="h-4 w-4 text-sky-400" />} sub="Total AI conversation time" />
          </div>

          {/* Six-question visitor flow — deliberately separated from the
              legacy CRM lead scoring above: qualification here means all six
              authored questions answered, never a HOT/WARM/COLD byproduct. */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Stat
              title="Qualifications Started"
              value={String(data.qualificationStarted)}
              icon={<MessageSquare className="h-4 w-4 text-indigo-400" />}
              sub="Six-question conversations begun"
            />
            <Stat
              title="Qualifications Completed"
              value={String(data.qualificationCompleted)}
              icon={<Users className="h-4 w-4 text-emerald-400" />}
              sub="All six questions answered"
            />
            <Stat
              title="Appointments Booked"
              value={String(data.appointmentsBooked)}
              icon={<Clock className="h-4 w-4 text-sky-400" />}
              sub="Real confirmed calendar bookings"
            />
            <Stat
              title="Qualified → Booked"
              value={data.definedConversion.percent === null ? "—" : `${data.definedConversion.percent}%`}
              icon={<TrendingUp className="h-4 w-4 text-amber-400" />}
              sub={
                data.definedConversion.percent === null
                  ? "No completed qualifications yet"
                  : `${data.definedConversion.numerator} of ${data.definedConversion.denominator}`
              }
            />
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

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="glass-panel border-white/[0.08] p-6">
              <h2 className="text-sm font-bold text-slate-100 mb-1">AI minutes per day</h2>
              <p className="text-[11px] text-slate-400 mb-4">Total AI conversation minutes, by day.</p>
              <CallVolumeChart data={data.minutesPerDay} />
            </Card>

            <Card className="glass-panel border-white/[0.08] p-6">
              <h2 className="text-sm font-bold text-slate-100 mb-1">Qualifications &amp; bookings per day</h2>
              <p className="text-[11px] text-slate-400 mb-4">
                Six-question completions (upper) and appointment requests (lower), by day.
              </p>
              <div className="space-y-4">
                <CallVolumeChart data={data.qualificationsPerDay} />
                <CallVolumeChart data={data.bookingsPerDay} />
              </div>
            </Card>

            <Card className="glass-panel border-white/[0.08] p-6">
              <h2 className="text-sm font-bold text-slate-100 mb-1">Conversion — defined</h2>
              <p className="text-[11px] text-slate-400 mb-4">{data.definedConversion.definition}</p>
              <div className="text-3xl font-extrabold text-slate-100 font-mono">
                {data.definedConversion.percent === null ? "No data yet" : `${data.definedConversion.percent}%`}
              </div>
              <p className="text-[11px] text-slate-400 mt-2">
                {data.definedConversion.denominator === 0
                  ? "A rate appears once at least one visitor completes all six questions."
                  : `${data.definedConversion.numerator} confirmed booking${data.definedConversion.numerator === 1 ? "" : "s"} from ${data.definedConversion.denominator} completed qualification${data.definedConversion.denominator === 1 ? "" : "s"}.`}
              </p>
            </Card>

            <Card className="glass-panel border-white/[0.08] p-6">
              <h2 className="text-sm font-bold text-slate-100 mb-1">WhatsApp activity</h2>
              <p className="text-[11px] text-slate-400 mb-4">{data.whatsappActivity.note}</p>
              <dl className="space-y-3">
                <div className="flex items-center justify-between">
                  <dt className="text-xs text-slate-300">Inbound qualification conversations</dt>
                  <dd className="text-lg font-bold text-slate-100 font-mono tabular-nums">{data.whatsappActivity.inboundConversations}</dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-xs text-slate-300">24h reminders sent</dt>
                  <dd className="text-lg font-bold text-slate-100 font-mono tabular-nums">{data.whatsappActivity.remindersSent}</dd>
                </div>
              </dl>
            </Card>
          </div>

          <Card className="glass-panel border-white/[0.08] p-6">
            <h2 className="text-sm font-bold text-slate-100 mb-1">Provider health</h2>
            <p className="text-[11px] text-slate-400 mb-4">{data.providerHealth.note}</p>
            <div className="flex flex-wrap gap-2.5">
              {(
                [
                  ["Database", data.providerHealth.database],
                  ["Vapi", data.providerHealth.vapi],
                  ["WhatsApp", data.providerHealth.whatsapp],
                  ["WhatsApp template", data.providerHealth.whatsappTemplate],
                  ["Calendar", data.providerHealth.calendar],
                  ["TTS", data.providerHealth.tts],
                ] as const
              ).map(([name, status]) => (
                <span
                  key={name}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-semibold ${
                    /^(ok|configured|available)/.test(status)
                      ? "bg-emerald-500/10 border-emerald-400/30 text-emerald-300"
                      : "bg-amber-500/10 border-amber-400/30 text-amber-300"
                  }`}
                >
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${/^(ok|configured|available)/.test(status) ? "bg-emerald-400" : "bg-amber-400"}`}
                    aria-hidden="true"
                  />
                  {name}: {status}
                </span>
              ))}
            </div>
          </Card>

          <Card className="glass-panel border-white/[0.08] p-6">
            <h2 className="text-sm font-bold text-slate-100 mb-4">Recent activity</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              <div>
                <h3 className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold mb-2">Latest AI conversations</h3>
                {data.recentActivity.conversations.length === 0 ? (
                  <p className="text-xs text-slate-500">No conversations yet.</p>
                ) : (
                  <ul className="space-y-2">
                    {data.recentActivity.conversations.map((c) => (
                      <li key={c.id} className="text-xs text-slate-300">
                        <span className="text-slate-100">{new Date(c.createdAt).toLocaleString()}</span>
                        <span className="text-slate-500"> · {c.channel}</span>
                        {c.intent && <span className="text-sky-300"> · {c.intent}</span>}
                        {typeof c.durationSeconds === "number" && c.durationSeconds > 0 && (
                          <span className="text-slate-500"> · {formatDuration(c.durationSeconds)}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div>
                <h3 className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold mb-2">Latest qualifications</h3>
                {data.recentActivity.qualifications.length === 0 ? (
                  <p className="text-xs text-slate-500">No completed qualifications yet.</p>
                ) : (
                  <ul className="space-y-2">
                    {data.recentActivity.qualifications.map((q) => (
                      <li key={q.id} className="text-xs">
                        <a href="/dashboard/leads" className="text-sky-300 hover:underline">
                          {q.name}
                        </a>
                        <span className="text-slate-500"> · {new Date(q.createdAt).toLocaleDateString()}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div>
                <h3 className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold mb-2">Latest bookings</h3>
                {data.recentActivity.bookings.length === 0 ? (
                  <p className="text-xs text-slate-500">No bookings yet.</p>
                ) : (
                  <ul className="space-y-2">
                    {data.recentActivity.bookings.map((b) => (
                      <li key={b.id} className="text-xs">
                        <a href="/dashboard/appointments" className="text-sky-300 hover:underline">
                          {new Date(b.startTime).toLocaleString()}
                        </a>
                        <span className={`ml-1.5 text-[10px] font-semibold ${b.status === "BOOKED" || b.status === "COMPLETED" ? "text-emerald-300" : "text-amber-300"}`}>
                          {b.status}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </Card>

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
