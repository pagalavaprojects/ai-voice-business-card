"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Card } from "@/shared/ui/card";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { apiFetch } from "@/shared/lib/apiClient";
import { useLivePoll } from "@/features/dashboard/hooks/useLivePoll";
import { CallVolumeChart, FunnelChart } from "@/features/dashboard/components/charts";

/**
 * The USER dashboard: only what belongs to the signed-in person's own
 * company.
 *
 * It talks to exactly one endpoint, /api/user/dashboard, which takes NO
 * companyId — the tenant is derived from the session server-side. So this
 * component has no company identifier to hold, pass or leak, and there is no
 * request it could make that would reach another tenant's rows. It shares
 * the live-poll hook and chart primitives with the admin dashboard; only the
 * dataset differs.
 */

type DashboardRange = "today" | "7d" | "30d" | "90d";

const RANGE_OPTIONS: Array<{ key: DashboardRange; label: string }> = [
  { key: "today", label: "Today" },
  { key: "7d", label: "7D" },
  { key: "30d", label: "30D" },
  { key: "90d", label: "90D" },
];

const LANGUAGE_LABELS: Record<string, string> = {
  en: "English",
  ta: "Tamil",
  hi: "Hindi",
  te: "Telugu",
  ml: "Malayalam",
  kn: "Kannada",
  unspecified: "Unspecified (legacy)",
};

const STATUS_META: Record<string, { label: string; className: string }> = {
  loading: { label: "Loading", className: "bg-slate-500/15 border-slate-400/30 text-slate-300" },
  live: { label: "Live", className: "bg-emerald-500/15 border-emerald-400/40 text-emerald-300" },
  refreshing: { label: "Refreshing", className: "bg-sky-500/15 border-sky-400/40 text-sky-300" },
  stale: { label: "Stale — last refresh failed", className: "bg-amber-500/15 border-amber-400/40 text-amber-300" },
  error: { label: "Error", className: "bg-rose-500/15 border-rose-400/40 text-rose-300" },
};

interface UserDashboardData {
  generatedAt: string;
  user: { email: string; role: string | null };
  company: { id: string; name: string | null; website: string | null };
  range: {
    key: DashboardRange;
    label: string;
    sinceIso: string;
    conversations: number;
    voiceMinutes: number;
    avgDurationSeconds: number | null;
    longestCallSeconds: number | null;
    languageSplit: Record<string, number>;
    series: Array<{ key: string; calls: number; minutes: number }>;
  };
  qualificationFunnel: { q1: number; q2: number; q3: number; q4: number; q5: number; q6: number; completed: number };
  bookingConversion: { definition: string; numerator: number; denominator: number; percent: number | null };
  appointments: {
    booked: number;
    requested: number;
    cancelled: number;
    upcoming: Array<{ id: string; startTime: string; status: string; timezone: string | null }>;
  };
  whatsapp: {
    qualificationConversations: number;
    appointmentConfirmations: { sent: number; failed: number };
    ownerSummaries: { sent: number; failed: number };
    reminders: { sent: number };
  };
  email: { providerAccepted: number; failed: number; simulated: number; deliveryConfirmable: boolean; providerState: string };
  serviceStatus: { aiVoice: string; calendar: string; whatsapp: string; email: string; pitchAudio: string };
  activity: Array<{ at: string; type: string; label: string; status: "ok" | "warn" | "fail"; detail?: string }>;
}

const LIVE_REFRESH_MS = 10_000;

function formatDuration(seconds: number | null): string {
  if (seconds === null) return "—";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function Stat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="p-3.5 rounded-xl bg-white/[0.03] border border-white/[0.08]">
      <p className="text-[11px] font-semibold text-slate-400">{label}</p>
      <p className="text-xl font-extrabold text-slate-100 font-mono tabular-nums mt-0.5">{value}</p>
      <p className="text-[10px] text-slate-500 mt-0.5">{hint}</p>
    </div>
  );
}

function Row({ label, value, warn = false }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-slate-300">{label}</dt>
      <dd className={`font-mono font-bold tabular-nums ${warn ? "text-amber-300" : "text-slate-100"}`}>{value}</dd>
    </div>
  );
}

export function UserDashboard() {
  const [range, setRange] = useState<DashboardRange>("30d");

  const fetchData = useCallback(async () => {
    // The owner's LOCAL midnight defines "today" — only the browser knows
    // their timezone. It is a display window, never an authorization input:
    // the tenant still comes from the session.
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    return apiFetch<UserDashboardData>(
      `/api/user/dashboard?range=${range}&todayStart=${encodeURIComponent(todayStart.toISOString())}`
    );
  }, [range]);

  const { data, status, lastUpdatedAt, error: pollError, refresh } = useLivePoll(fetchData, LIVE_REFRESH_MS, true);

  const mountedRef = useRef(false);
  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      return;
    }
    refresh();
  }, [range, refresh]);

  if (status === "loading" && !data) return <div className="text-sm text-slate-400">Loading your dashboard…</div>;
  if (status === "error" && !data) {
    return (
      <Card className="glass-panel border-white/[0.08] p-6">
        <p className="text-sm text-rose-300">{pollError ?? "Could not load your dashboard."}</p>
      </Card>
    );
  }
  if (!data) return null;

  const funnelData = [
    { stage: "Q1", count: data.qualificationFunnel.q1 },
    { stage: "Q2", count: data.qualificationFunnel.q2 },
    { stage: "Q3", count: data.qualificationFunnel.q3 },
    { stage: "Q4", count: data.qualificationFunnel.q4 },
    { stage: "Q5", count: data.qualificationFunnel.q5 },
    { stage: "Q6", count: data.qualificationFunnel.q6 },
  ];

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 tracking-tight">{data.company.name ?? "My dashboard"}</h1>
          <p className="text-xs text-slate-400">
            Signed in as {data.user.email}
            {data.user.role ? ` · ${data.user.role}` : ""} — everything below is your own company&apos;s activity.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
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
          <Button variant="glass" size="sm" onClick={refresh} className="text-xs">
            Refresh
          </Button>
        </div>
      </div>

      {/* ---- My usage ---- */}
      <Card className="glass-panel border-white/[0.08] p-6 space-y-5">
        <div>
          <h2 className="text-base font-bold text-slate-100">My AI voice usage</h2>
          <p className="text-xs text-slate-400">{data.range.label} · counted from your own conversations.</p>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Stat label="Conversations" value={String(data.range.conversations)} hint={data.range.label} />
          <Stat label="Voice minutes" value={data.range.voiceMinutes.toFixed(1)} hint="Recorded call time" />
          <Stat
            label="Average call"
            value={formatDuration(data.range.avgDurationSeconds)}
            hint={data.range.conversations === 0 ? "No calls in range" : "Mean duration"}
          />
          <Stat
            label="Longest call"
            value={formatDuration(data.range.longestCallSeconds)}
            hint={data.range.longestCallSeconds === null ? "No calls in range" : "Single longest call"}
          />
        </div>
        {data.range.conversations === 0 ? (
          <p className="text-xs text-slate-400 py-6 text-center">No AI conversations in this range yet.</p>
        ) : (
          <div className="grid lg:grid-cols-2 gap-5">
            <div>
              <h3 className="text-xs font-semibold text-slate-300 mb-2">Calls per day</h3>
              <CallVolumeChart data={data.range.series.map((p) => ({ key: p.key, calls: p.calls }))} label="Calls" />
            </div>
            <div>
              <h3 className="text-xs font-semibold text-slate-300 mb-2">Voice minutes per day</h3>
              <CallVolumeChart data={data.range.series.map((p) => ({ key: p.key, calls: p.minutes }))} label="Minutes" />
            </div>
          </div>
        )}
        <div>
          <h3 className="text-xs font-semibold text-slate-300 mb-2">Conversation language</h3>
          {Object.keys(data.range.languageSplit).length === 0 ? (
            <p className="text-xs text-slate-400">No data yet</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {Object.entries(data.range.languageSplit)
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

      {/* ---- Qualification + conversion ---- */}
      <div className="grid lg:grid-cols-2 gap-5">
        <Card className="glass-panel border-white/[0.08] p-6 space-y-4">
          <div>
            <h2 className="text-base font-bold text-slate-100">My qualification</h2>
            <p className="text-xs text-slate-400">How far visitors get through the six questions.</p>
          </div>
          <FunnelChart data={funnelData} emptyMessage="No qualification answers recorded yet." />
          <Row label="Completed (all six)" value={String(data.qualificationFunnel.completed)} />
        </Card>

        <Card className="glass-panel border-white/[0.08] p-6 space-y-4">
          <div>
            <h2 className="text-base font-bold text-slate-100">My conversion</h2>
            <p className="text-xs text-slate-400">{data.bookingConversion.definition}</p>
          </div>
          {data.bookingConversion.percent === null ? (
            <p className="text-sm text-slate-300 py-4">No completed qualifications yet.</p>
          ) : (
            <p className="text-3xl font-extrabold text-slate-100 font-mono tabular-nums">{data.bookingConversion.percent}%</p>
          )}
          <dl className="space-y-2 text-xs">
            <Row label="Confirmed appointments" value={String(data.bookingConversion.numerator)} />
            <Row label="Completed qualifications" value={String(data.bookingConversion.denominator)} />
          </dl>
        </Card>
      </div>

      {/* ---- Appointments ---- */}
      <Card className="glass-panel border-white/[0.08] p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-100">My appointments</h2>
            <p className="text-xs text-slate-400">Bookings made through your AI card.</p>
          </div>
          <Link href="/dashboard/appointments" className="text-xs font-semibold text-sky-400 hover:underline">
            View all →
          </Link>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Stat label="Booked" value={String(data.appointments.booked)} hint="Confirmed on the calendar" />
          <Stat label="Requested" value={String(data.appointments.requested)} hint="Awaiting confirmation" />
          <Stat label="Cancelled" value={String(data.appointments.cancelled)} hint="No longer scheduled" />
        </div>
        <div>
          <h3 className="text-xs font-semibold text-slate-300 mb-2">Next up</h3>
          {data.appointments.upcoming.length === 0 ? (
            <p className="text-xs text-slate-400">No upcoming appointments.</p>
          ) : (
            <ul className="space-y-2">
              {data.appointments.upcoming.map((a) => (
                <li key={a.id} className="flex items-center justify-between text-xs">
                  <span className="text-slate-200">
                    {new Date(a.startTime).toLocaleString()}
                    {a.timezone ? <span className="text-slate-500"> · {a.timezone}</span> : null}
                  </span>
                  <Badge variant={a.status === "BOOKED" ? "success" : "warning"}>{a.status}</Badge>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>

      {/* ---- My notifications ---- */}
      <div className="grid lg:grid-cols-2 gap-5">
        <Card className="glass-panel border-white/[0.08] p-6 space-y-4">
          <div>
            <h2 className="text-base font-bold text-slate-100">My WhatsApp activity</h2>
            <p className="text-xs text-slate-400">
              &ldquo;Sent&rdquo; means the provider accepted the message; handset delivery is not observable.
            </p>
          </div>
          <dl className="space-y-2 text-xs">
            <Row label="Qualification conversations" value={String(data.whatsapp.qualificationConversations)} />
            <Row
              label="Appointment confirmations"
              value={`${data.whatsapp.appointmentConfirmations.sent} sent / ${data.whatsapp.appointmentConfirmations.failed} failed`}
              warn={data.whatsapp.appointmentConfirmations.failed > 0}
            />
            <Row
              label="Conversation summaries"
              value={`${data.whatsapp.ownerSummaries.sent} sent / ${data.whatsapp.ownerSummaries.failed} failed`}
              warn={data.whatsapp.ownerSummaries.failed > 0}
            />
            <Row label="24-hour reminders" value={String(data.whatsapp.reminders.sent)} />
          </dl>
        </Card>

        <Card className="glass-panel border-white/[0.08] p-6 space-y-4">
          <div>
            <h2 className="text-base font-bold text-slate-100">My email</h2>
            <p className="text-xs text-slate-400">Provider state: {data.email.providerState}. These are acceptances, not delivery receipts.</p>
          </div>
          <dl className="space-y-2 text-xs">
            <Row label="Accepted by provider" value={String(data.email.providerAccepted)} />
            <Row label="Failed" value={String(data.email.failed)} warn={data.email.failed > 0} />
            {data.email.simulated > 0 && <Row label="Simulated (never delivered)" value={String(data.email.simulated)} warn />}
          </dl>
        </Card>
      </div>

      {/* ---- My business ---- */}
      <Card className="glass-panel border-white/[0.08] p-6 space-y-4">
        <div>
          <h2 className="text-base font-bold text-slate-100">My business</h2>
          <p className="text-xs text-slate-400">Your account and the services behind your AI card.</p>
        </div>
        <dl className="grid sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-2 text-xs">
          <Row label="Company" value={data.company.name ?? "—"} />
          <Row label="Signed in as" value={data.user.email} />
          <Row label="Role" value={data.user.role ?? "—"} />
          <Row label="AI voice" value={data.serviceStatus.aiVoice} />
          <Row label="Calendar booking" value={data.serviceStatus.calendar} />
          <Row label="WhatsApp" value={data.serviceStatus.whatsapp} />
          <Row label="Email" value={data.serviceStatus.email} />
          <Row label="Pitch audio" value={data.serviceStatus.pitchAudio} />
          <Row label="Last updated" value={lastUpdatedAt ? new Date(lastUpdatedAt).toLocaleTimeString() : "—"} />
        </dl>
        {data.company.website && (
          <a href={data.company.website} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold text-sky-400 hover:underline">
            {data.company.website} →
          </a>
        )}
      </Card>

      {/* ---- My recent activity ---- */}
      <Card className="glass-panel border-white/[0.08] p-6 space-y-4">
        <div>
          <h2 className="text-base font-bold text-slate-100">My recent activity</h2>
          <p className="text-xs text-slate-400">Newest first — your own conversations, appointments and notifications.</p>
        </div>
        {data.activity.length === 0 ? (
          <p className="text-xs text-slate-400 py-4 text-center">No activity yet.</p>
        ) : (
          <ul className="space-y-2">
            {data.activity.map((e, i) => (
              <li key={`${e.at}-${i}`} className="flex items-start justify-between gap-3 text-xs border-b border-white/[0.05] pb-2 last:border-0">
                <div className="min-w-0">
                  <p className="text-slate-200">{e.label}</p>
                  {e.detail && <p className="text-[11px] text-slate-500 truncate">{e.detail}</p>}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge variant={e.status === "ok" ? "success" : e.status === "warn" ? "warning" : "danger"}>{e.status}</Badge>
                  <span className="text-[11px] text-slate-500 tabular-nums">{new Date(e.at).toLocaleString()}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
