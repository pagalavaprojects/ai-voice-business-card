"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { MessageSquare, Users, Calendar, Clock, Loader2, AlertCircle, Download, MessagesSquare, Activity, Mic, TrendingUp } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/shared/ui/card";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { useCompany } from "@/features/dashboard/context/CompanyContext";
import { apiFetch } from "@/shared/lib/apiClient";
import { useLivePoll } from "@/features/dashboard/hooks/useLivePoll";
import { useToast } from "@/shared/ui/toast";
import { toCsv, downloadCsv } from "@/shared/lib/csv";
import { CallVolumeChart } from "@/features/dashboard/components/charts";

interface RecentLead {
  id: string;
  name: string;
  email: string;
  score: number | null;
  score_category: "HIGH" | "MEDIUM" | "LOW" | null;
  status: string;
  created_at: string;
}

interface RecentConversation {
  id: string;
  employeeName: string;
  status: string;
  startedAt: string;
  endedAt: string | null;
  durationSeconds: number | null;
  summary: string | null;
  sentiment: string | null;
}

interface TopTopic {
  tool: string;
  label: string;
  count: number;
}

interface ActivityEvent {
  at: string;
  type: string;
  label: string;
  status: "ok" | "warn" | "fail";
  detail?: string;
}

interface DashboardStats {
  generatedAt: string;
  totalConversations: number;
  conversationsThisWeek: number;
  weekOverWeekPercent: number | null;
  totalLeads: number;
  qualifiedLeads: number;
  appointmentsBooked: number;
  appointmentsPendingConfirmation: number;
  avgDurationSeconds: number | null;
  leadConversionPercent: number | null;
  recentLeads: RecentLead[];
  recentConversations: RecentConversation[];
  topTopics: TopTopic[];
  conversationsToday: number;
  appointmentsToday: number;
  voiceMinutesToday: number;
  voiceMinutes7d: number;
  qualificationFunnel: { q1: number; q2: number; q3: number; q4: number; q5: number; q6: number; completed: number };
  bookingConversion: { definition: string; numerator: number; denominator: number; percent: number | null };
  appointmentsCancelled: number;
  upcomingAppointments: Array<{ id: string; startTime: string; status: string; leadName: string }>;
  whatsapp: {
    inboundConversations: number;
    ownerSummaries: { sent: number; failed: number; lastOutcome: { sent: boolean; reason?: string | null; at?: string } | null };
  };
  providerHealth: {
    database: string;
    vapi: string;
    whatsapp: string;
    whatsappTemplate: string;
    calendar: string;
    email: string;
    cron: string;
    tts: string;
    note: string;
  };
  activityFeed: ActivityEvent[];
  range: {
    key: DashboardRange;
    label: string;
    sinceIso: string;
    conversations: number;
    voiceMinutes: number;
    completedConversations: number;
    appointments: number;
    avgDurationSeconds: number | null;
    longestCallSeconds: number | null;
    languageSplit: Record<string, number>;
    series: Array<{ key: string; calls: number; minutes: number }>;
  };
  whatsappBreakdown: {
    qualificationConversations: number;
    appointmentConfirmations: { sent: number; failed: number };
    ownerSummaries: { sent: number; failed: number };
    reminders: { sent: number };
  };
  email: {
    providerAccepted: number;
    failed: number;
    simulated: number;
    clientConfirmations: number;
    adminConfirmations: number;
    deliveryConfirmable: boolean;
    providerState: string;
  };
  tts: { playbackInstrumented: boolean; note: string; providerState: string };
  issues: Array<{ id: string; problem: string; status: string; action: string; severity: "blocked" | "degraded" }>;
}

type DashboardRange = "today" | "7d" | "30d" | "90d";

/** Cross-tenant totals — only ever populated for a platform admin, because
 * /api/admin/platform refuses every company-scoped role. */
interface PlatformOverview {
  platform: { companies: number; users: number; employees: number; conversations: number; leads: number };
  range: { label: string; conversations: number; voiceMinutes: number; languageSplit: Record<string, number> };
  appointments: { booked: number; requested: number; cancelled: number };
  environment: string;
  systemHealth: Record<string, string>;
}

const RANGE_OPTIONS: Array<{ key: DashboardRange; label: string }> = [
  { key: "today", label: "Today" },
  { key: "7d", label: "7D" },
  { key: "30d", label: "30D" },
  { key: "90d", label: "90D" },
];

/** Human labels for the language codes the conversations table persists.
 * Anything unrecognised falls back to the raw code rather than being
 * relabelled or hidden. */
const LANGUAGE_LABELS: Record<string, string> = {
  en: "English",
  ta: "Tamil",
  hi: "Hindi",
  te: "Telugu",
  ml: "Malayalam",
  kn: "Kannada",
  unspecified: "Unspecified (legacy)",
};

/** Live refresh cadence for operational metrics. Provider health rides the
 * same consolidated request, so nothing polls separately. */
const LIVE_REFRESH_MS = 10_000;

function formatDuration(seconds: number | null): string {
  if (seconds === null) return "—";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

/** "Updated 8s ago" — re-rendered on a coarse tick so the label stays honest
 * without re-rendering the whole page every second. */
function FreshnessLabel({ lastUpdatedAt }: { lastUpdatedAt: number | null }) {
  const [, forceTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => forceTick((n) => n + 1), 5000);
    return () => clearInterval(t);
  }, []);
  if (lastUpdatedAt === null) return null;
  const seconds = Math.max(0, Math.round((Date.now() - lastUpdatedAt) / 1000));
  return <span className="text-[11px] text-slate-400">{seconds < 8 ? "Updated just now" : `Updated ${seconds}s ago`}</span>;
}

const STATUS_META: Record<string, { label: string; className: string }> = {
  loading: { label: "Loading", className: "bg-slate-500/15 border-slate-400/30 text-slate-300" },
  live: { label: "Live", className: "bg-emerald-500/15 border-emerald-400/40 text-emerald-300" },
  refreshing: { label: "Refreshing", className: "bg-sky-500/15 border-sky-400/40 text-sky-300" },
  stale: { label: "Stale — last refresh failed", className: "bg-amber-500/15 border-amber-400/40 text-amber-300" },
  error: { label: "Error", className: "bg-rose-500/15 border-rose-400/40 text-rose-300" },
};

export function AdminDashboard() {
  const { activeCompanyId, loading: companyLoading } = useCompany();
  const { showToast } = useToast();

  const [range, setRange] = useState<DashboardRange>("30d");

  // Platform-wide totals ride their own request because they are gated on
  // platform-admin, not on company access: a company OWNER legitimately sees
  // the company blocks below and must NOT see this. Fetched once per range
  // rather than on the 10s operational loop — cross-tenant counts do not
  // change fast enough to justify polling them.
  const [platform, setPlatform] = useState<PlatformOverview | null>(null);
  const [platformError, setPlatformError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    apiFetch<PlatformOverview>(`/api/admin/platform?range=${range}`)
      .then((data) => {
        if (!cancelled) {
          setPlatform(data);
          setPlatformError(null);
        }
      })
      .catch((err: Error) => {
        // A non-platform-admin gets 403 here by design; the block simply does
        // not render rather than showing an alarming error.
        if (!cancelled) {
          setPlatform(null);
          setPlatformError(err.message);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [range]);

  const fetchStats = useCallback(async () => {
    // The owner's LOCAL midnight defines "today" — computed here because
    // only the browser knows the owner's timezone.
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    return apiFetch<DashboardStats>(
      `/api/admin/stats?companyId=${activeCompanyId}&todayStart=${encodeURIComponent(todayStart.toISOString())}&range=${range}`
    );
  }, [activeCompanyId, range]);

  const { data: stats, status, lastUpdatedAt, error: pollError, refresh } = useLivePoll(fetchStats, LIVE_REFRESH_MS, Boolean(activeCompanyId));
  const loading = status === "loading";
  const error = status === "error" ? pollError : null;

  // The poll hook keeps its fetcher in a ref (so a changing closure never
  // restarts the timer), which means a new range would otherwise wait up to
  // a full interval to appear. Refresh immediately on an actual range
  // CHANGE — skipping the first render, where the hook has already fetched.
  const mountedRangeRef = useRef(false);
  useEffect(() => {
    if (!mountedRangeRef.current) {
      mountedRangeRef.current = true;
      return;
    }
    refresh();
  }, [range, refresh]);

  const exportRecentLeads = () => {
    if (!stats || stats.recentLeads.length === 0) return;
    const csv = toCsv(
      ["Name", "Email", "Category", "Score", "Status", "Captured"],
      stats.recentLeads.map((l) => [l.name, l.email, l.score_category ?? "", l.score ?? "", l.status, new Date(l.created_at).toISOString()])
    );
    downloadCsv(`recent-leads-${new Date().toISOString().slice(0, 10)}.csv`, csv);
    showToast(`Exported ${stats.recentLeads.length} lead${stats.recentLeads.length === 1 ? "" : "s"}`, "success");
  };

  const exportRecentConversations = () => {
    if (!stats || stats.recentConversations.length === 0) return;
    const csv = toCsv(
      ["Employee", "Status", "Started", "Duration (s)", "Sentiment", "Summary"],
      stats.recentConversations.map((c) => [
        c.employeeName,
        c.status,
        new Date(c.startedAt).toISOString(),
        c.durationSeconds ?? "",
        c.sentiment ?? "",
        c.summary ?? "",
      ])
    );
    downloadCsv(`recent-conversations-${new Date().toISOString().slice(0, 10)}.csv`, csv);
    showToast(`Exported ${stats.recentConversations.length} conversation${stats.recentConversations.length === 1 ? "" : "s"}`, "success");
  };

  if (companyLoading) return <div className="text-sm text-slate-400">Loading workspace…</div>;
  if (!activeCompanyId) return <div className="text-sm text-slate-400">No company selected.</div>;

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 tracking-tight">MaylaanAI</h1>
          <p className="text-xs text-slate-400">
            Your Business Insight, Backed by Deep-Tech — live metrics from your own conversations, leads and appointments.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {/* Range control. Changing it re-keys the live fetch, so the whole
              page moves to the new window in ONE request — no per-widget
              refetch. */}
          <div className="inline-flex rounded-lg border border-white/[0.08] bg-white/[0.02] p-0.5" role="group" aria-label="Time range">
            {RANGE_OPTIONS.map((opt) => (
              <button
                key={opt.key}
                type="button"
                onClick={() => setRange(opt.key)}
                aria-pressed={range === opt.key}
                className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors ${
                  range === opt.key ? "bg-sky-500/20 text-sky-200" : "text-slate-400 hover:text-slate-200"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <span
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-semibold ${STATUS_META[status].className}`}
            role="status"
            aria-live="polite"
          >
            <span className={`h-1.5 w-1.5 rounded-full ${status === "live" ? "bg-emerald-400 animate-pulse" : "bg-current opacity-60"}`} aria-hidden="true" />
            {STATUS_META[status].label}
          </span>
          <FreshnessLabel lastUpdatedAt={lastUpdatedAt} />
          <Button variant="glass" size="sm" onClick={refresh} className="text-xs">
            Refresh
          </Button>
        </div>
      </div>

      {error && (
        <div role="alert" className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs">
          {error}
        </div>
      )}
      {status === "stale" && (
        <div role="alert" className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-200 text-xs">
          The last refresh failed — the numbers below are from the last successful update, not live.
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-slate-400" role="status" aria-live="polite">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          Loading metrics…
        </div>
      ) : stats ? (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Metric
              title="Total Conversations"
              value={String(stats.totalConversations)}
              icon={<MessageSquare className="h-4 w-4 text-sky-400" aria-hidden="true" />}
              // Rendered only when a prior week exists to compare against.
              // A fabricated "+18.4%" was exactly what this page used to show.
              sub={
                stats.weekOverWeekPercent === null
                  ? `${stats.conversationsThisWeek} in the last 7 days`
                  : `${stats.weekOverWeekPercent >= 0 ? "↑" : "↓"} ${Math.abs(stats.weekOverWeekPercent)}% vs previous week`
              }
              subTone={stats.weekOverWeekPercent === null ? "neutral" : stats.weekOverWeekPercent >= 0 ? "good" : "bad"}
            />
            <Metric
              title="Qualified Leads"
              value={String(stats.qualifiedLeads)}
              icon={<Users className="h-4 w-4 text-emerald-400" aria-hidden="true" />}
              sub={`${stats.totalLeads} total captured`}
            />
            <Metric
              title="Booked Meetings"
              value={String(stats.appointmentsBooked)}
              icon={<Calendar className="h-4 w-4 text-indigo-400" aria-hidden="true" />}
              sub={
                stats.appointmentsPendingConfirmation > 0
                  ? `${stats.appointmentsPendingConfirmation} awaiting confirmation`
                  : "All confirmed"
              }
              subTone={stats.appointmentsPendingConfirmation > 0 ? "warn" : "neutral"}
            />
            <Metric
              title="Avg Call Duration"
              value={formatDuration(stats.avgDurationSeconds)}
              icon={<Clock className="h-4 w-4 text-amber-400" aria-hidden="true" />}
              sub={
                stats.leadConversionPercent === null
                  ? "No completed calls yet"
                  : `${stats.leadConversionPercent}% of calls produce a lead`
              }
            />
          </div>

          {/* Live operational row — today's real numbers plus the defined
              conversion. Nothing here has a fallback value: a zero is the
              database's zero, a dash is a genuinely undefined ratio. */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Metric
              title="Conversations Today"
              value={String(stats.conversationsToday)}
              icon={<Activity className="h-4 w-4 text-sky-400" aria-hidden="true" />}
              sub={`${stats.appointmentsToday} appointment${stats.appointmentsToday === 1 ? "" : "s"} today`}
            />
            <Metric
              title="AI Voice Minutes"
              value={`${stats.voiceMinutesToday}m`}
              icon={<Mic className="h-4 w-4 text-violet-400" aria-hidden="true" />}
              sub={`${stats.voiceMinutes7d}m in the last 7 days`}
            />
            <Metric
              title="Qualifications Completed"
              value={String(stats.qualificationFunnel.completed)}
              icon={<Users className="h-4 w-4 text-emerald-400" aria-hidden="true" />}
              sub="All six questions answered (30d)"
            />
            <Metric
              title="Qualified → Booked"
              value={stats.bookingConversion.percent === null ? "—" : `${stats.bookingConversion.percent}%`}
              icon={<TrendingUp className="h-4 w-4 text-amber-400" aria-hidden="true" />}
              sub={
                stats.bookingConversion.percent === null
                  ? "No completed qualifications yet"
                  : `${stats.bookingConversion.numerator} of ${stats.bookingConversion.denominator}`
              }
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Six-question funnel — counts come from the persisted Qn answer
                lines only; an empty funnel renders as an honest empty state. */}
            <Card className="glass-panel border-white/[0.08] p-6 space-y-4">
              <div>
                <h2 className="text-base font-bold text-slate-100">Qualification Funnel</h2>
                <p className="text-xs text-slate-400">Visitors reaching each of the six authored questions, last 30 days.</p>
              </div>
              {stats.qualificationFunnel.q1 === 0 ? (
                <p className="text-xs text-slate-400 py-4 text-center">
                  No qualification answers recorded in the last 30 days. The funnel fills in as visitors answer Q1–Q6.
                </p>
              ) : (
                <ul className="space-y-2.5">
                  {([1, 2, 3, 4, 5, 6] as const).map((n) => {
                    const reached = stats.qualificationFunnel[`q${n}` as "q1"];
                    const max = stats.qualificationFunnel.q1;
                    const pct = max > 0 ? Math.round((reached / max) * 100) : 0;
                    return (
                      <li key={n}>
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className="text-slate-300">Q{n} answered</span>
                          <span className="font-mono font-bold text-slate-200 tabular-nums">{reached}</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                          <div className="h-full rounded-full bg-emerald-400/70" style={{ width: `${pct}%` }} />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>

            {/* Live activity feed — every row is a persisted database record. */}
            <Card className="glass-panel border-white/[0.08] p-6 space-y-4">
              <div>
                <h2 className="text-base font-bold text-slate-100">Live Activity</h2>
                <p className="text-xs text-slate-400">Newest first — conversations, bookings, and notification outcomes.</p>
              </div>
              {stats.activityFeed.length === 0 ? (
                <p className="text-xs text-slate-400 py-4 text-center">No activity yet.</p>
              ) : (
                <ul className="space-y-2.5 max-h-80 overflow-y-auto pr-1">
                  {stats.activityFeed.map((e, i) => (
                    <li key={`${e.at}-${e.type}-${i}`} className="flex items-start gap-2.5 text-xs">
                      <span
                        className={`h-2 w-2 rounded-full mt-1 shrink-0 ${
                          e.status === "ok" ? "bg-emerald-400" : e.status === "warn" ? "bg-amber-400" : "bg-rose-400"
                        }`}
                        aria-hidden="true"
                      />
                      <div className="min-w-0">
                        <span className="text-slate-200">{e.label}</span>
                        {e.detail && <span className="text-slate-500"> · {e.detail}</span>}
                        <div className="text-[10px] text-slate-500">{new Date(e.at).toLocaleString()}</div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Upcoming real appointments. */}
            <Card className="glass-panel border-white/[0.08] p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-bold text-slate-100">Upcoming Appointments</h2>
                  <p className="text-xs text-slate-400">Next scheduled meetings from your calendar records.</p>
                </div>
                <Link href="/dashboard/appointments" className="text-xs font-semibold text-sky-400 hover:underline whitespace-nowrap">
                  View all →
                </Link>
              </div>
              {stats.upcomingAppointments.length === 0 ? (
                <p className="text-xs text-slate-400 py-4 text-center">No upcoming appointments.</p>
              ) : (
                <ul className="space-y-2.5">
                  {stats.upcomingAppointments.map((a) => (
                    <li key={a.id} className="flex items-center justify-between text-xs">
                      <div>
                        <span className="text-slate-100 font-medium">{a.leadName}</span>
                        <span className="text-slate-500"> · {new Date(a.startTime).toLocaleString()}</span>
                      </div>
                      <Badge variant={a.status === "BOOKED" ? "success" : "warning"}>{a.status}</Badge>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            {/* WhatsApp + provider truth — recorded outcomes and credential
                presence, never inferred delivery. */}
            <Card className="glass-panel border-white/[0.08] p-6 space-y-4">
              <div>
                <h2 className="text-base font-bold text-slate-100">WhatsApp &amp; Providers</h2>
                <p className="text-xs text-slate-400">{stats.providerHealth.note}</p>
              </div>
              <dl className="space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <dt className="text-slate-300">Inbound WhatsApp conversations</dt>
                  <dd className="font-mono font-bold text-slate-100 tabular-nums">{stats.whatsapp.inboundConversations}</dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-slate-300">Owner summaries sent / failed</dt>
                  <dd className="font-mono font-bold text-slate-100 tabular-nums">
                    {stats.whatsapp.ownerSummaries.sent} / {stats.whatsapp.ownerSummaries.failed}
                  </dd>
                </div>
                {stats.whatsapp.ownerSummaries.lastOutcome && !stats.whatsapp.ownerSummaries.lastOutcome.sent && (
                  <p className="text-[11px] text-amber-300">
                    Last summary blocked: {stats.whatsapp.ownerSummaries.lastOutcome.reason ?? "unknown"} — see provider status below.
                  </p>
                )}
              </dl>
              <div className="flex flex-wrap gap-2 pt-1">
                {(
                  [
                    ["Database", stats.providerHealth.database],
                    ["Vapi", stats.providerHealth.vapi],
                    ["WhatsApp", stats.providerHealth.whatsapp],
                    ["Template", stats.providerHealth.whatsappTemplate],
                    ["Calendar", stats.providerHealth.calendar],
                    ["Email", stats.providerHealth.email],
                    ["Cron", stats.providerHealth.cron],
                    ["TTS", stats.providerHealth.tts],
                  ] as const
                ).map(([name, s]) => (
                  <span
                    key={name}
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-semibold ${
                      /^(ok|configured|available)/.test(s)
                        ? "bg-emerald-500/10 border-emerald-400/30 text-emerald-300"
                        : "bg-amber-500/10 border-amber-400/30 text-amber-300"
                    }`}
                  >
                    {name}: {s}
                  </span>
                ))}
              </div>
            </Card>
          </div>

          {stats.appointmentsPendingConfirmation > 0 && (
            <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-amber-500/[0.08] border border-amber-500/20">
              <AlertCircle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" aria-hidden="true" />
              <p className="text-xs text-amber-200">
                <strong>{stats.appointmentsPendingConfirmation}</strong>{" "}
                {stats.appointmentsPendingConfirmation === 1 ? "appointment needs" : "appointments need"} confirmation — the visitor
                gave a preferred time but no calendar invitation has been sent yet.{" "}
                <Link href="/dashboard/appointments" className="underline font-semibold hover:text-amber-100">
                  Review
                </Link>
              </p>
            </div>
          )}

          {/* ---- Platform overview: every company's rows together. Present
              only for a platform admin — the endpoint behind it refuses any
              company-scoped role, so this block cannot render for a tenant
              owner even if they reached this page. ---- */}
          {platform && (
            <Card className="glass-panel border-white/[0.08] p-6 space-y-5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div>
                  <h2 className="text-base font-bold text-slate-100">Platform overview</h2>
                  <p className="text-xs text-slate-400">Every company on this deployment · {platform.range.label}.</p>
                </div>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-sky-400/30 bg-sky-500/10 text-[10px] font-semibold text-sky-300">
                  {platform.environment}
                </span>
              </div>
              <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                <RangeStat label="Companies" value={String(platform.platform.companies)} hint="Tenants on this deployment" />
                <RangeStat label="Users" value={String(platform.platform.users)} hint="Accounts with platform access" />
                <RangeStat label="AI employees" value={String(platform.platform.employees)} hint="Voice cards across all tenants" />
                <RangeStat label="Conversations" value={String(platform.platform.conversations)} hint="All time, all tenants" />
                <RangeStat label="Leads" value={String(platform.platform.leads)} hint="All time, all tenants" />
              </div>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <RangeStat label="Calls in range" value={String(platform.range.conversations)} hint={platform.range.label} />
                <RangeStat label="Voice minutes" value={platform.range.voiceMinutes.toFixed(1)} hint="Platform-wide" />
                <RangeStat label="Booked" value={String(platform.appointments.booked)} hint="All tenants" />
                <RangeStat
                  label="Requested / cancelled"
                  value={`${platform.appointments.requested} / ${platform.appointments.cancelled}`}
                  hint="All tenants"
                />
              </div>
            </Card>
          )}
          {platformError && !platform && (
            <p className="text-[11px] text-slate-500">Platform-wide metrics are restricted to platform administrators.</p>
          )}

          {/* ---- Current blockers. Rendered ONLY from persisted evidence
              (recorded send failures, probe results) — a provider that is
              merely unused raises nothing. Server-derived so the rule lives
              in one tested place, not in JSX. ---- */}
          {stats.issues.length > 0 && (
            <Card className="glass-panel border-white/[0.08] p-6 space-y-3">
              <div>
                <h2 className="text-base font-bold text-slate-100">Current blockers</h2>
                <p className="text-xs text-slate-400">Active issues with recorded evidence, and what resolves each one.</p>
              </div>
              <ul className="space-y-2.5">
                {stats.issues.map((issue) => (
                  <li
                    key={issue.id}
                    className={`p-3 rounded-xl border ${
                      issue.severity === "blocked" ? "bg-rose-500/[0.08] border-rose-500/20" : "bg-amber-500/[0.07] border-amber-500/20"
                    }`}
                  >
                    <div className="flex items-start gap-2.5">
                      <AlertCircle
                        className={`h-4 w-4 shrink-0 mt-0.5 ${issue.severity === "blocked" ? "text-rose-400" : "text-amber-400"}`}
                        aria-hidden="true"
                      />
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-slate-100">{issue.problem}</p>
                        <p className="text-[11px] text-slate-300 mt-0.5">{issue.status}</p>
                        <p className="text-[11px] text-slate-400 mt-1">Action: {issue.action}</p>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {/* ---- AI voice usage for the selected range ---- */}
          <Card className="glass-panel border-white/[0.08] p-6 space-y-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <h2 className="text-base font-bold text-slate-100">AI voice usage</h2>
                <p className="text-xs text-slate-400">
                  {stats.range.label} · every figure counted from your own conversation records.
                </p>
              </div>
              <span className="text-[11px] text-slate-500">since {new Date(stats.range.sinceIso).toLocaleDateString()}</span>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <RangeStat label="Conversations" value={String(stats.range.conversations)} hint={stats.range.label} />
              <RangeStat label="Voice minutes" value={stats.range.voiceMinutes.toFixed(1)} hint="Sum of recorded call durations" />
              <RangeStat
                label="Average call"
                value={formatDuration(stats.range.avgDurationSeconds)}
                hint={stats.range.conversations === 0 ? "No calls in range" : "Mean recorded duration"}
              />
              <RangeStat
                label="Longest call"
                value={formatDuration(stats.range.longestCallSeconds)}
                hint={stats.range.longestCallSeconds === null ? "No calls in range" : "Single longest recorded call"}
              />
            </div>

            {stats.range.conversations === 0 ? (
              <p className="text-xs text-slate-400 py-6 text-center">No AI conversations in this range.</p>
            ) : (
              <div className="grid lg:grid-cols-2 gap-5">
                <div>
                  <h3 className="text-xs font-semibold text-slate-300 mb-2">Calls per day</h3>
                  <CallVolumeChart data={stats.range.series.map((p) => ({ key: p.key, calls: p.calls }))} label="Calls" />
                </div>
                <div>
                  <h3 className="text-xs font-semibold text-slate-300 mb-2">Voice minutes per day</h3>
                  <CallVolumeChart data={stats.range.series.map((p) => ({ key: p.key, calls: p.minutes }))} label="Minutes" />
                </div>
              </div>
            )}

            <div>
              <h3 className="text-xs font-semibold text-slate-300 mb-2">Conversation language</h3>
              {Object.keys(stats.range.languageSplit).length === 0 ? (
                <p className="text-xs text-slate-400">No data</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {Object.entries(stats.range.languageSplit)
                    .sort((a, b) => b[1] - a[1])
                    .map(([code, count]) => (
                      <span
                        key={code}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-white/[0.08] bg-white/[0.03] text-[11px] text-slate-200"
                      >
                        {LANGUAGE_LABELS[code] ?? code}
                        <span className="font-mono font-bold tabular-nums text-slate-100">{count}</span>
                      </span>
                    ))}
                </div>
              )}
            </div>
          </Card>

          {/* ---- Notification truth: four DISTINCT WhatsApp categories, and
              email acceptance that never claims delivery. ---- */}
          <div className="grid lg:grid-cols-2 gap-5">
            <Card className="glass-panel border-white/[0.08] p-6 space-y-4">
              <div>
                <h2 className="text-base font-bold text-slate-100">WhatsApp activity</h2>
                <p className="text-xs text-slate-400">
                  &ldquo;Sent&rdquo; means the provider accepted the message. Handset delivery is not observable here.
                </p>
              </div>
              <dl className="space-y-2 text-xs">
                <OutcomeRow label="Qualification conversations (inbound)" value={String(stats.whatsappBreakdown.qualificationConversations)} />
                <OutcomeRow
                  label="Appointment confirmations"
                  value={`${stats.whatsappBreakdown.appointmentConfirmations.sent} sent / ${stats.whatsappBreakdown.appointmentConfirmations.failed} failed`}
                  warn={stats.whatsappBreakdown.appointmentConfirmations.failed > 0}
                />
                <OutcomeRow
                  label="Owner conversation summaries"
                  value={`${stats.whatsappBreakdown.ownerSummaries.sent} sent / ${stats.whatsappBreakdown.ownerSummaries.failed} failed`}
                  warn={stats.whatsappBreakdown.ownerSummaries.failed > 0}
                />
                <OutcomeRow label="24-hour reminders" value={String(stats.whatsappBreakdown.reminders.sent)} />
              </dl>
            </Card>

            <Card className="glass-panel border-white/[0.08] p-6 space-y-4">
              <div>
                <h2 className="text-base font-bold text-slate-100">Email</h2>
                <p className="text-xs text-slate-400">
                  Provider state: {stats.email.providerState}. No delivery receipts are available, so these are acceptances.
                </p>
              </div>
              <dl className="space-y-2 text-xs">
                <OutcomeRow label="Accepted by provider" value={String(stats.email.providerAccepted)} />
                <OutcomeRow label="Failed" value={String(stats.email.failed)} warn={stats.email.failed > 0} />
                <OutcomeRow label="Client confirmations" value={String(stats.email.clientConfirmations)} />
                <OutcomeRow label="Admin confirmations" value={String(stats.email.adminConfirmations)} />
                {stats.email.simulated > 0 && (
                  <OutcomeRow label="Simulated (never delivered)" value={String(stats.email.simulated)} warn />
                )}
              </dl>
            </Card>
          </div>

          {/* ---- Consumption & cost. Consumption is measured; monetary cost
              is NOT recorded anywhere in this system, so it is declared
              unavailable rather than estimated from an assumed price. ---- */}
          <div className="grid lg:grid-cols-2 gap-5">
            <Card className="glass-panel border-white/[0.08] p-6 space-y-4">
              <div>
                <h2 className="text-base font-bold text-slate-100">Consumption &amp; cost</h2>
                <p className="text-xs text-slate-400">Measured usage for {stats.range.label.toLowerCase()}.</p>
              </div>
              <dl className="space-y-2 text-xs">
                <OutcomeRow label="AI voice calls" value={String(stats.range.conversations)} />
                <OutcomeRow label="AI voice minutes" value={stats.range.voiceMinutes.toFixed(1)} />
                <OutcomeRow label="Appointments created" value={String(stats.range.appointments)} />
                <OutcomeRow label="Qualification conversations" value={String(stats.qualificationFunnel.q1)} />
              </dl>
              <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.08]">
                <p className="text-[11px] font-semibold text-slate-200">Cost data unavailable</p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Provider charges are not recorded in this system, so no monetary figure is shown. Usage above is measured;
                  any cost number here would be an assumption.
                </p>
              </div>
            </Card>

            <Card className="glass-panel border-white/[0.08] p-6 space-y-4">
              <div>
                <h2 className="text-base font-bold text-slate-100">Pitch &amp; introduction audio</h2>
                <p className="text-xs text-slate-400">Pre-recorded playback — a separate system from the live AI conversation.</p>
              </div>
              <dl className="space-y-2 text-xs">
                <OutcomeRow label="Speech provider" value={stats.tts.providerState} warn={!/available|configured/.test(stats.tts.providerState)} />
              </dl>
              <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.08]">
                <p className="text-[11px] font-semibold text-slate-200">Playback not measurable</p>
                <p className="text-[11px] text-slate-400 mt-0.5">{stats.tts.note}</p>
              </div>
            </Card>
          </div>

          {/* ---- Project information. Non-sensitive facts only. ---- */}
          <Card className="glass-panel border-white/[0.08] p-6 space-y-4">
            <div>
              <h2 className="text-base font-bold text-slate-100">Project information</h2>
              <p className="text-xs text-slate-400">Configuration as this deployment actually reports it.</p>
            </div>
            <dl className="grid sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-2 text-xs">
              <OutcomeRow label="Project" value="MaylaanAI" />
              <OutcomeRow label="AI voice" value={stats.providerHealth.vapi} />
              <OutcomeRow label="Calendar" value={stats.providerHealth.calendar} />
              <OutcomeRow label="WhatsApp" value={stats.providerHealth.whatsapp} />
              <OutcomeRow label="Email" value={stats.providerHealth.email} />
              <OutcomeRow label="Scheduled reminders" value={stats.providerHealth.cron} />
              <OutcomeRow label="Database" value={stats.providerHealth.database} />
              <OutcomeRow label="Speech (pitch audio)" value={stats.providerHealth.tts} />
              <OutcomeRow label="Last successful sync" value={lastUpdatedAt ? new Date(lastUpdatedAt).toLocaleTimeString() : "—"} />
            </dl>
          </Card>

          <Card className="glass-panel border-white/[0.08] p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-slate-100">Recent Leads</h2>
                <p className="text-xs text-slate-400">The five most recent leads captured by your AI.</p>
              </div>
              <div className="flex items-center gap-3">
                {stats.recentLeads.length > 0 && (
                  <Button variant="glass" size="sm" onClick={exportRecentLeads} className="text-xs flex items-center gap-1.5">
                    <Download className="h-3.5 w-3.5" aria-hidden="true" />
                    Export CSV
                  </Button>
                )}
                <Link href="/dashboard/leads" className="text-xs font-semibold text-sky-400 hover:underline whitespace-nowrap">
                  View all leads →
                </Link>
              </div>
            </div>

            {stats.recentLeads.length === 0 ? (
              <p className="text-xs text-slate-400 py-4 text-center">
                No leads captured yet. They&apos;ll appear here as soon as your AI saves one during a call.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="text-[11px] uppercase tracking-wider text-slate-400 border-b border-white/[0.08]">
                    <tr>
                      <th scope="col" className="pb-3 font-semibold">Name</th>
                      <th scope="col" className="pb-3 font-semibold">Email</th>
                      <th scope="col" className="pb-3 font-semibold">Category</th>
                      <th scope="col" className="pb-3 font-semibold">Score</th>
                      <th scope="col" className="pb-3 font-semibold">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.06]">
                    {stats.recentLeads.map((lead) => (
                      <tr key={lead.id}>
                        <td className="py-3 font-medium text-slate-100">{lead.name}</td>
                        <td className="py-3 text-slate-400">{lead.email}</td>
                        <td className="py-3">
                          <Badge variant={lead.score_category === "HIGH" ? "success" : lead.score_category === "MEDIUM" ? "warning" : "outline"}>
                            {lead.score_category ?? "—"}
                          </Badge>
                        </td>
                        <td className="py-3 font-mono font-bold text-slate-200 tabular-nums">{lead.score ?? "—"}</td>
                        <td className="py-3 text-sky-400 font-medium">{lead.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="glass-panel border-white/[0.08] p-6 space-y-4">
              <div>
                <h2 className="text-base font-bold text-slate-100">Top Topics</h2>
                <p className="text-xs text-slate-400">
                  What visitors&apos; calls actually triggered, most common first.{" "}
                  {stats.topTopics.length > 0 && "There's no free-text question log yet, so this is the closest honest signal."}
                </p>
              </div>

              {stats.topTopics.length === 0 ? (
                <p className="text-xs text-slate-400 py-4 text-center">No calls have triggered a tool yet.</p>
              ) : (
                <ul className="space-y-2.5">
                  {stats.topTopics.map((topic) => {
                    const max = stats.topTopics[0].count;
                    const pct = max > 0 ? Math.round((topic.count / max) * 100) : 0;
                    return (
                      <li key={topic.tool}>
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className="text-slate-300">{topic.label}</span>
                          <span className="font-mono font-bold text-slate-200 tabular-nums">{topic.count}</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                          <div className="h-full rounded-full bg-sky-400/70" style={{ width: `${pct}%` }} />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>

            <Card className="glass-panel border-white/[0.08] p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <MessagesSquare className="h-4 w-4 text-violet-400" aria-hidden="true" />
                  <h2 className="text-base font-bold text-slate-100">Recent Conversations</h2>
                </div>
                {stats.recentConversations.length > 0 && (
                  <Button variant="glass" size="sm" onClick={exportRecentConversations} className="text-xs flex items-center gap-1.5">
                    <Download className="h-3.5 w-3.5" aria-hidden="true" />
                    Export CSV
                  </Button>
                )}
              </div>

              {stats.recentConversations.length === 0 ? (
                <p className="text-xs text-slate-400 py-4 text-center">No calls yet. They&apos;ll appear here as soon as someone talks to your card.</p>
              ) : (
                <ul className="space-y-3 divide-y divide-white/[0.06]">
                  {stats.recentConversations.map((c) => (
                    <li key={c.id} className="pt-3 first:pt-0 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-slate-100">{c.employeeName}</span>
                        <span className="text-slate-500 whitespace-nowrap">{new Date(c.startedAt).toLocaleString()}</span>
                      </div>
                      <div className="flex items-center gap-2 mt-1 text-slate-400">
                        <Badge variant={c.status === "ENDED" || c.status === "SUMMARIZED" ? "success" : c.status === "FAILED" ? "outline" : "warning"}>
                          {c.status}
                        </Badge>
                        <span>{formatDuration(c.durationSeconds)}</span>
                        {c.sentiment && <span className="capitalize">· {c.sentiment}</span>}
                      </div>
                      {c.summary && <p className="mt-1.5 text-slate-400 line-clamp-2">{c.summary}</p>}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </>
      ) : null}
    </div>
  );
}

function Metric({
  title,
  value,
  icon,
  sub,
  subTone = "neutral",
}: {
  title: string;
  value: string;
  icon: React.ReactNode;
  sub: string;
  subTone?: "good" | "bad" | "warn" | "neutral";
}) {
  const toneClass =
    subTone === "good" ? "text-emerald-400" : subTone === "bad" ? "text-rose-400" : subTone === "warn" ? "text-amber-400" : "text-slate-400";
  return (
    <Card className="glass-panel border-white/[0.08]">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-xs font-semibold text-slate-400">{title}</CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-extrabold text-slate-100 font-mono tabular-nums">{value}</div>
        <p className={`text-[11px] font-medium mt-1 ${toneClass}`}>{sub}</p>
      </CardContent>
    </Card>
  );
}

/** A single range-scoped figure. `hint` states what the number is counted
 * from, so no value on this page is unexplained. */
function RangeStat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="p-3.5 rounded-xl bg-white/[0.03] border border-white/[0.08]">
      <p className="text-[11px] font-semibold text-slate-400">{label}</p>
      <p className="text-xl font-extrabold text-slate-100 font-mono tabular-nums mt-0.5">{value}</p>
      <p className="text-[10px] text-slate-500 mt-0.5">{hint}</p>
    </div>
  );
}

/** A label/value row for recorded outcomes. `warn` tints only when the value
 * genuinely represents a failure — never as decoration. */
function OutcomeRow({ label, value, warn = false }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-slate-300">{label}</dt>
      <dd className={`font-mono font-bold tabular-nums ${warn ? "text-amber-300" : "text-slate-100"}`}>{value}</dd>
    </div>
  );
}
