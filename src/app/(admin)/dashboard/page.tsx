"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { MessageSquare, Users, Calendar, Clock, Loader2, AlertCircle } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/shared/ui/card";
import { Badge } from "@/shared/ui/badge";
import { useCompany } from "@/features/dashboard/context/CompanyContext";
import { apiFetch, ApiClientError } from "@/shared/lib/apiClient";

interface RecentLead {
  id: string;
  name: string;
  email: string;
  score: number | null;
  score_category: "HIGH" | "MEDIUM" | "LOW" | null;
  status: string;
  created_at: string;
}

interface DashboardStats {
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
}

function formatDuration(seconds: number | null): string {
  if (seconds === null) return "—";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

export default function DashboardOverviewPage() {
  const { activeCompanyId, loading: companyLoading } = useCompany();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = useCallback(async () => {
    if (!activeCompanyId) return;
    setLoading(true);
    setError(null);
    try {
      setStats(await apiFetch<DashboardStats>(`/api/admin/stats?companyId=${activeCompanyId}`));
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Failed to load dashboard statistics");
    } finally {
      setLoading(false);
    }
  }, [activeCompanyId]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  if (companyLoading) return <div className="text-sm text-slate-400">Loading workspace…</div>;
  if (!activeCompanyId) return <div className="text-sm text-slate-400">No company selected.</div>;

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-slate-100 tracking-tight">System Overview</h1>
        <p className="text-xs text-slate-400">Live metrics from your own conversations, leads and appointments.</p>
      </div>

      {error && (
        <div role="alert" className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs">
          {error}
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

          <Card className="glass-panel border-white/[0.08] p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-slate-100">Recent Leads</h2>
                <p className="text-xs text-slate-400">The five most recent leads captured by your AI.</p>
              </div>
              <Link href="/dashboard/leads" className="text-xs font-semibold text-sky-400 hover:underline">
                View all leads →
              </Link>
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
