"use client";

import React from "react";
import { MessageSquare, Users, Calendar, TrendingUp } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/shared/ui/card";
import { Badge } from "@/shared/ui/badge";

export default function DashboardOverviewPage() {
  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      {/* Overview Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-100 tracking-tight">System Overview</h1>
        <p className="text-xs text-slate-400">Real-time performance metrics across all active AI digital twin cards.</p>
      </div>

      {/* Metric Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="glass-panel border-white/[0.08]">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold text-slate-400">Total Conversations</CardTitle>
            <MessageSquare className="h-4 w-4 text-sky-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-extrabold text-slate-100 font-mono">1,284</div>
            <p className="text-[11px] text-emerald-400 font-medium mt-1">↑ +18.4% vs last week</p>
          </CardContent>
        </Card>

        <Card className="glass-panel border-white/[0.08]">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold text-slate-400">Qualified Leads</CardTitle>
            <Users className="h-4 w-4 text-emerald-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-extrabold text-slate-100 font-mono">412</div>
            <p className="text-[11px] text-emerald-400 font-medium mt-1">↑ +12.1% qualification rate</p>
          </CardContent>
        </Card>

        <Card className="glass-panel border-white/[0.08]">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold text-slate-400">Booked Meetings</CardTitle>
            <Calendar className="h-4 w-4 text-indigo-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-extrabold text-slate-100 font-mono">98</div>
            <p className="text-[11px] text-emerald-400 font-medium mt-1">↑ +8.5% conversion</p>
          </CardContent>
        </Card>

        <Card className="glass-panel border-white/[0.08]">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold text-slate-400">Avg Call Duration</CardTitle>
            <TrendingUp className="h-4 w-4 text-amber-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-extrabold text-slate-100 font-mono">2m 45s</div>
            <p className="text-[11px] text-slate-400 font-medium mt-1">Optimal engagement</p>
          </CardContent>
        </Card>
      </div>

      {/* Recent Qualified Leads Preview */}
      <Card className="glass-panel border-white/[0.08] p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-100">Recent High-Score Qualified Leads</h2>
            <p className="text-xs text-slate-400">AI-scored leads with high budget and immediate intent.</p>
          </div>
          <a href="/dashboard/leads" className="text-xs font-semibold text-sky-400 hover:underline">
            View All Leads →
          </a>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="text-[11px] uppercase tracking-wider text-slate-500 border-b border-white/[0.08]">
              <tr>
                <th className="pb-3 font-semibold">Lead Name</th>
                <th className="pb-3 font-semibold">Contact Email</th>
                <th className="pb-3 font-semibold">Score Category</th>
                <th className="pb-3 font-semibold">Score</th>
                <th className="pb-3 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.06]">
              <tr>
                <td className="py-3 font-medium text-slate-100">Alexander Wright</td>
                <td className="py-3 text-slate-400">alex@quantumtech.com</td>
                <td className="py-3">
                  <Badge variant="success">HIGH</Badge>
                </td>
                <td className="py-3 font-mono font-bold text-emerald-400">90</td>
                <td className="py-3 text-sky-400 font-medium">QUALIFIED</td>
              </tr>
              <tr>
                <td className="py-3 font-medium text-slate-100">Elena Rostova</td>
                <td className="py-3 text-slate-400">elena@cybernet.io</td>
                <td className="py-3">
                  <Badge variant="success">HIGH</Badge>
                </td>
                <td className="py-3 font-mono font-bold text-emerald-400">80</td>
                <td className="py-3 text-indigo-400 font-medium">BOOKED</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
