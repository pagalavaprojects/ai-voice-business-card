"use client";

import React, { useState } from "react";
import { Calendar, Clock, Search, Plus, CheckCircle, XCircle, AlertCircle } from "lucide-react";
import { Card } from "@/shared/ui/card";
import { Button } from "@/shared/ui/button";
import { Badge } from "@/shared/ui/badge";

interface Appointment {
  id: string;
  leadName: string;
  email: string;
  company: string;
  date: string;
  time: string;
  duration: string;
  status: "CONFIRMED" | "PENDING" | "CANCELLED";
  meetingLink: string;
}

const dummyAppointments: Appointment[] = [
  {
    id: "apt-1",
    leadName: "Alexander Wright",
    email: "alex@quantumtech.com",
    company: "QuantumTech",
    date: "2026-08-05",
    time: "10:00 AM",
    duration: "30 min",
    status: "CONFIRMED",
    meetingLink: "https://cal.com/admin/meeting-1",
  },
  {
    id: "apt-2",
    leadName: "Elena Rostova",
    email: "elena@cybernet.io",
    company: "CyberNet Systems",
    date: "2026-08-06",
    time: "2:00 PM",
    duration: "30 min",
    status: "PENDING",
    meetingLink: "https://cal.com/admin/meeting-2",
  },
  {
    id: "apt-3",
    leadName: "Marcus Vance",
    email: "marcus@vancecapital.com",
    company: "Vance Capital",
    date: "2026-08-10",
    time: "11:30 AM",
    duration: "60 min",
    status: "CONFIRMED",
    meetingLink: "https://cal.com/admin/meeting-3",
  },
  {
    id: "apt-4",
    leadName: "Sofia Chen",
    email: "sofia@horizonstartup.com",
    company: "Horizon Startup",
    date: "2026-08-08",
    time: "3:30 PM",
    duration: "30 min",
    status: "CANCELLED",
    meetingLink: "https://cal.com/admin/meeting-4",
  },
];

const statusConfig: Record<
  Appointment["status"],
  { label: string; icon: React.ElementType; colorClass: string; badgeVariant: "success" | "warning" | "danger" }
> = {
  CONFIRMED: { label: "Confirmed", icon: CheckCircle, colorClass: "text-emerald-400", badgeVariant: "success" },
  PENDING: { label: "Pending", icon: AlertCircle, colorClass: "text-amber-400", badgeVariant: "warning" },
  CANCELLED: { label: "Cancelled", icon: XCircle, colorClass: "text-rose-400", badgeVariant: "danger" },
};

export default function AppointmentsPage() {
  const [searchTerm, setSearchTerm] = useState("");

  const filtered = dummyAppointments.filter(
    (a) =>
      a.leadName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      a.company.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 tracking-tight">Appointments</h1>
          <p className="text-xs text-slate-400">All meetings booked through AI digital twin conversations via Cal.com.</p>
        </div>
        <Button variant="default" className="flex items-center gap-2 text-xs">
          <Plus className="h-4 w-4" />
          Book Manual Meeting
        </Button>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Total Meetings", value: dummyAppointments.length, icon: Calendar, color: "text-sky-400" },
          { label: "Confirmed", value: dummyAppointments.filter((a) => a.status === "CONFIRMED").length, icon: CheckCircle, color: "text-emerald-400" },
          { label: "Pending", value: dummyAppointments.filter((a) => a.status === "PENDING").length, icon: AlertCircle, color: "text-amber-400" },
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

      {/* Appointment Table */}
      <Card className="glass-panel border-white/[0.08] p-6 space-y-4">
        <div className="relative">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
          <input
            type="text"
            placeholder="Search by lead name or company..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full rounded-xl bg-slate-900/80 border border-white/[0.08] pl-9 pr-4 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500"
          />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="text-[11px] uppercase tracking-wider text-slate-500 border-b border-white/[0.08]">
              <tr>
                <th className="pb-3 font-semibold">Lead</th>
                <th className="pb-3 font-semibold">Company</th>
                <th className="pb-3 font-semibold">Date</th>
                <th className="pb-3 font-semibold">Time</th>
                <th className="pb-3 font-semibold">Duration</th>
                <th className="pb-3 font-semibold">Status</th>
                <th className="pb-3 font-semibold">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.06]">
              {filtered.map((apt) => {
                const { label, icon: Icon, colorClass, badgeVariant } = statusConfig[apt.status];
                return (
                  <tr key={apt.id} className="hover:bg-white/[0.02]">
                    <td className="py-3">
                      <div className="font-semibold text-slate-100">{apt.leadName}</div>
                      <div className="text-[11px] text-slate-400">{apt.email}</div>
                    </td>
                    <td className="py-3 text-slate-300">{apt.company}</td>
                    <td className="py-3 font-mono text-slate-200">{apt.date}</td>
                    <td className="py-3">
                      <div className="flex items-center gap-1 text-slate-300">
                        <Clock className="h-3 w-3 text-slate-500" />
                        {apt.time}
                      </div>
                    </td>
                    <td className="py-3 text-slate-400">{apt.duration}</td>
                    <td className="py-3">
                      <Badge variant={badgeVariant}>
                        <Icon className={`h-3 w-3 mr-1 ${colorClass}`} />
                        {label}
                      </Badge>
                    </td>
                    <td className="py-3">
                      <a
                        href={apt.meetingLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-sky-400 hover:underline font-semibold"
                      >
                        Open →
                      </a>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-slate-500">
                    No appointments found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
