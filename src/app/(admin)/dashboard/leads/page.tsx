"use client";

import React, { useState } from "react";
import { Download, Search, Filter } from "lucide-react";
import { Card } from "@/shared/ui/card";
import { Button } from "@/shared/ui/button";
import { Badge } from "@/shared/ui/badge";

const dummyLeads = [
  {
    id: "lead-1",
    name: "Alexander Wright",
    email: "alex@quantumtech.com",
    phone: "+1 (555) 234-5678",
    business: "QuantumTech",
    score: 90,
    score_category: "HIGH",
    status: "QUALIFIED",
    problem: "Needs AI voice bot for 5,000 inbound sales calls/month.",
  },
  {
    id: "lead-2",
    name: "Elena Rostova",
    email: "elena@cybernet.io",
    phone: "+1 (555) 987-6543",
    business: "CyberNet Systems",
    score: 80,
    score_category: "HIGH",
    status: "BOOKED",
    problem: "Looking for instant calendar booking integration.",
  },
  {
    id: "lead-3",
    name: "Marcus Vance",
    email: "marcus@vancecapital.com",
    phone: "+1 (555) 345-6789",
    business: "Vance Capital",
    score: 45,
    score_category: "MEDIUM",
    status: "NEW",
    problem: "Exploring options for financial advisory digital twins.",
  },
];

export default function LeadsPage() {
  const [searchTerm, setSearchTerm] = useState("");

  const exportCSV = () => {
    const headers = "Name,Email,Phone,Business,Score,Category,Status\n";
    const rows = dummyLeads
      .map((l) => `"${l.name}","${l.email}","${l.phone}","${l.business}",${l.score},"${l.score_category}","${l.status}"`)
      .join("\n");

    const blob = new Blob([headers + rows], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "leads_export.csv";
    a.click();
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 tracking-tight">Lead Qualification & CRM</h1>
          <p className="text-xs text-slate-400">View and manage leads automatically qualified by your AI Digital Twins.</p>
        </div>
        <Button variant="glass" onClick={exportCSV} className="flex items-center gap-2 text-xs">
          <Download className="h-4 w-4" />
          Export CSV
        </Button>
      </div>

      <Card className="glass-panel border-white/[0.08] p-6 space-y-4">
        {/* Search & Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
            <input
              type="text"
              placeholder="Search by lead name, email, or business..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full rounded-xl bg-slate-900/80 border border-white/[0.08] pl-9 pr-4 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500"
            />
          </div>
          <Button variant="outline" className="flex items-center gap-2 text-xs">
            <Filter className="h-4 w-4" />
            Filter
          </Button>
        </div>

        {/* Lead Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="text-[11px] uppercase tracking-wider text-slate-500 border-b border-white/[0.08]">
              <tr>
                <th className="pb-3 font-semibold">Lead Details</th>
                <th className="pb-3 font-semibold">Company / Industry</th>
                <th className="pb-3 font-semibold">Score Category</th>
                <th className="pb-3 font-semibold">Score</th>
                <th className="pb-3 font-semibold">Pain Point / Need</th>
                <th className="pb-3 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.06]">
              {dummyLeads.map((lead) => (
                <tr key={lead.id} className="hover:bg-white/[0.02]">
                  <td className="py-3">
                    <div className="font-semibold text-slate-100">{lead.name}</div>
                    <div className="text-[11px] text-slate-400">{lead.email} • {lead.phone}</div>
                  </td>
                  <td className="py-3 font-medium text-slate-300">{lead.business}</td>
                  <td className="py-3">
                    <Badge variant={lead.score_category === "HIGH" ? "success" : "warning"}>
                      {lead.score_category}
                    </Badge>
                  </td>
                  <td className="py-3 font-mono font-bold text-sky-400">{lead.score}</td>
                  <td className="py-3 text-slate-400 max-w-xs truncate">{lead.problem}</td>
                  <td className="py-3 font-semibold text-emerald-400">{lead.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
