"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Calendar, Clock, Search, CheckCircle, XCircle, AlertCircle, Loader2, RefreshCw, Ban } from "lucide-react";
import { Card } from "@/shared/ui/card";
import { Button } from "@/shared/ui/button";
import { Badge } from "@/shared/ui/badge";
import { Dialog } from "@/shared/ui/dialog";
import { useToast } from "@/shared/ui/toast";
import { useCompany } from "@/features/dashboard/context/CompanyContext";
import { apiFetch, ApiClientError } from "@/shared/lib/apiClient";
import { Appointment, AppointmentStatus } from "@/core/domain/models/types";

const statusConfig: Record<AppointmentStatus, { label: string; icon: React.ElementType; colorClass: string; badgeVariant: "success" | "warning" | "danger" }> = {
  // Surfaced distinctly on purpose: a REQUESTED row has no calendar event
  // behind it and is waiting on a human, which is exactly the queue an admin
  // needs to see. Showing it as "Booked" would hide work that must be done.
  REQUESTED: { label: "Needs confirmation", icon: AlertCircle, colorClass: "text-amber-400", badgeVariant: "warning" },
  BOOKED: { label: "Booked", icon: CheckCircle, colorClass: "text-sky-400", badgeVariant: "success" },
  COMPLETED: { label: "Completed", icon: CheckCircle, colorClass: "text-emerald-400", badgeVariant: "success" },
  CANCELLED: { label: "Cancelled", icon: XCircle, colorClass: "text-rose-400", badgeVariant: "danger" },
};

export default function AppointmentsPage() {
  const { activeCompanyId, loading: companyLoading } = useCompany();
  const { showToast } = useToast();

  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [rescheduleTarget, setRescheduleTarget] = useState<Appointment | null>(null);
  const [newStart, setNewStart] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const fetchAppointments = useCallback(async () => {
    if (!activeCompanyId) return;
    setLoading(true);
    try {
      const data = await apiFetch<{ appointments: Appointment[] }>(`/api/admin/appointments?companyId=${activeCompanyId}`);
      setAppointments(data.appointments);
    } catch (err) {
      showToast(err instanceof ApiClientError ? err.message : "Failed to load appointments", "error");
    } finally {
      setLoading(false);
    }
  }, [activeCompanyId, showToast]);

  useEffect(() => {
    fetchAppointments();
  }, [fetchAppointments]);

  const filtered = appointments.filter((a) => a.meeting_url?.toLowerCase().includes(searchTerm.toLowerCase()) || searchTerm === "");

  const handleCancel = async (appt: Appointment) => {
    if (!activeCompanyId) return;
    setBusyId(appt.id);
    try {
      const updated = await apiFetch<Appointment>(`/api/admin/appointments/${appt.id}/cancel`, {
        method: "PUT",
        body: JSON.stringify({ company_id: activeCompanyId, reason: "Cancelled from dashboard" }),
      });
      setAppointments((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
      showToast("Appointment cancelled", "success");
    } catch (err) {
      showToast(err instanceof ApiClientError ? err.message : "Cancel failed", "error");
    } finally {
      setBusyId(null);
    }
  };

  const openReschedule = (appt: Appointment) => {
    setRescheduleTarget(appt);
    setNewStart(new Date(appt.start_time).toISOString().slice(0, 16));
  };

  const submitReschedule = async () => {
    if (!activeCompanyId || !rescheduleTarget || !newStart) return;
    setBusyId(rescheduleTarget.id);
    try {
      const start = new Date(newStart);
      const durationMs = new Date(rescheduleTarget.end_time).getTime() - new Date(rescheduleTarget.start_time).getTime();
      const end = new Date(start.getTime() + durationMs);

      const updated = await apiFetch<Appointment>(`/api/admin/appointments/${rescheduleTarget.id}/reschedule`, {
        method: "PUT",
        body: JSON.stringify({ company_id: activeCompanyId, start_time: start.toISOString(), end_time: end.toISOString() }),
      });
      setAppointments((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
      setRescheduleTarget(null);
      showToast("Appointment rescheduled", "success");
    } catch (err) {
      showToast(err instanceof ApiClientError ? err.message : "Reschedule failed", "error");
    } finally {
      setBusyId(null);
    }
  };

  if (companyLoading) return <div className="text-sm text-slate-500">Loading workspace…</div>;
  if (!activeCompanyId) return <div className="text-sm text-slate-500">No company selected.</div>;

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 tracking-tight">Appointments</h1>
          <p className="text-xs text-slate-400">All meetings booked through AI digital twin conversations via Cal.com.</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Total Meetings", value: appointments.length, icon: Calendar, color: "text-sky-400" },
          { label: "Booked", value: appointments.filter((a) => a.status === "BOOKED").length, icon: AlertCircle, color: "text-amber-400" },
          { label: "Completed", value: appointments.filter((a) => a.status === "COMPLETED").length, icon: CheckCircle, color: "text-emerald-400" },
        ].map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.label} className="glass-panel border-white/[0.08] p-4">
              <div className="flex items-center gap-3">
                <Icon className={`h-5 w-5 ${stat.color}`} />
                <div>
                  <div className={`text-2xl font-extrabold font-mono ${stat.color}`}>{stat.value}</div>
                  <div className="text-[11px] text-slate-400">{stat.label}</div>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      <Card className="glass-panel border-white/[0.08] p-6 space-y-4">
        <div className="relative">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
          <input
            type="text"
            placeholder="Search by meeting link…"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full rounded-xl bg-slate-900/80 border border-white/[0.08] pl-9 pr-4 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500"
          />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="text-[11px] uppercase tracking-wider text-slate-500 border-b border-white/[0.08]">
              <tr>
                <th className="pb-3 font-semibold">Date</th>
                <th className="pb-3 font-semibold">Time</th>
                <th className="pb-3 font-semibold">Timezone</th>
                <th className="pb-3 font-semibold">Status</th>
                <th className="pb-3 font-semibold">Meeting</th>
                <th className="pb-3 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.06]">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-slate-500">
                    <Loader2 className="h-4 w-4 animate-spin inline mr-2" />
                    Loading appointments…
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-slate-500">
                    No appointments found.
                  </td>
                </tr>
              ) : (
                filtered.map((appt) => {
                  const { label, icon: Icon, colorClass, badgeVariant } = statusConfig[appt.status];
                  const start = new Date(appt.start_time);
                  return (
                    <tr key={appt.id} className="hover:bg-white/[0.02]">
                      <td className="py-3 font-mono text-slate-200">{start.toLocaleDateString()}</td>
                      <td className="py-3">
                        <div className="flex items-center gap-1 text-slate-300">
                          <Clock className="h-3 w-3 text-slate-500" />
                          {start.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </div>
                      </td>
                      <td className="py-3 text-slate-400">{appt.timezone}</td>
                      <td className="py-3">
                        <Badge variant={badgeVariant}>
                          <Icon className={`h-3 w-3 mr-1 ${colorClass}`} />
                          {label}
                        </Badge>
                      </td>
                      <td className="py-3">
                        {appt.meeting_url ? (
                          <a href={appt.meeting_url} target="_blank" rel="noopener noreferrer" className="text-xs text-sky-400 hover:underline font-semibold">
                            Open →
                          </a>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="py-3">
                        {appt.status === "BOOKED" && (
                          <div className="flex items-center gap-1">
                            <Button variant="ghost" size="sm" onClick={() => openReschedule(appt)} disabled={busyId === appt.id} aria-label="Reschedule">
                              <RefreshCw className="h-3.5 w-3.5" />
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => handleCancel(appt)} disabled={busyId === appt.id} aria-label="Cancel">
                              {busyId === appt.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Ban className="h-3.5 w-3.5 text-rose-400" />}
                            </Button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Dialog open={!!rescheduleTarget} onClose={() => setRescheduleTarget(null)} title="Reschedule Appointment" size="sm">
        <div className="space-y-3">
          <label className="block text-xs">
            <span className="block text-[11px] uppercase tracking-wide text-slate-500 mb-1">New start time</span>
            <input type="datetime-local" value={newStart} onChange={(e) => setNewStart(e.target.value)} className="dashboard-input" />
          </label>
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setRescheduleTarget(null)}>
              Cancel
            </Button>
            <Button variant="default" size="sm" onClick={submitReschedule} disabled={!!busyId}>
              {busyId ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Confirm Reschedule"}
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
