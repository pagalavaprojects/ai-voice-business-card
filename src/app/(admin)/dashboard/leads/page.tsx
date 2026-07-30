"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Download, Search, ArrowUpDown, Loader2, AlertCircle } from "lucide-react";
import { Card } from "@/shared/ui/card";
import { Button } from "@/shared/ui/button";
import { Badge } from "@/shared/ui/badge";
import { Dialog } from "@/shared/ui/dialog";
import { useCompany } from "@/features/dashboard/context/CompanyContext";
import { apiFetch, ApiClientError } from "@/shared/lib/apiClient";
import { Appointment, Conversation, CompanyMember, Lead, LeadActivity, LeadStatus, UserProfile } from "@/core/domain/models/types";
import { useToast } from "@/shared/ui/toast";

const STATUS_OPTIONS: Array<Lead["status"] | "ALL"> = [
  "ALL",
  LeadStatus.NEW,
  LeadStatus.CONTACTED,
  LeadStatus.QUALIFIED,
  LeadStatus.BOOKED,
  LeadStatus.DISQUALIFIED,
];
const PAGE_SIZE = 20;

export default function LeadsPage() {
  const { activeCompanyId, loading: companyLoading } = useCompany();
  const { showToast } = useToast();

  const [leads, setLeads] = useState<Lead[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<Lead["status"] | "ALL">("ALL");
  const [sortBy, setSortBy] = useState<"created_at" | "score" | "name">("created_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(0);

  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [timeline, setTimeline] = useState<LeadActivity[] | null>(null);
  const [leadAppointments, setLeadAppointments] = useState<Appointment[]>([]);
  const [leadConversation, setLeadConversation] = useState<Conversation | null>(null);
  const [timelineLoading, setTimelineLoading] = useState(false);

  const [members, setMembers] = useState<Array<CompanyMember & { user: UserProfile | null }>>([]);
  const [tagInput, setTagInput] = useState("");
  const [noteInput, setNoteInput] = useState("");
  const [savingNote, setSavingNote] = useState(false);

  useEffect(() => {
    if (!activeCompanyId) return;
    apiFetch<Array<CompanyMember & { user: UserProfile | null }>>(`/api/admin/members?companyId=${activeCompanyId}`)
      .then(setMembers)
      .catch(() => setMembers([]));
  }, [activeCompanyId]);

  // Debounce the search box into the actual query param instead of filtering
  // client-side against nothing, which was the previous page's bug.
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput);
      setPage(0);
    }, 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  const fetchLeads = useCallback(async () => {
    if (!activeCompanyId) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        companyId: activeCompanyId,
        sortBy,
        sortDir,
        limit: String(PAGE_SIZE),
        offset: String(page * PAGE_SIZE),
      });
      if (status !== "ALL") params.set("status", status);
      if (search) params.set("search", search);

      const data = await apiFetch<{ leads: Lead[]; total: number }>(`/api/admin/leads?${params.toString()}`);
      setLeads(data.leads);
      setTotal(data.total);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Failed to load leads");
    } finally {
      setLoading(false);
    }
  }, [activeCompanyId, status, search, sortBy, sortDir, page]);

  useEffect(() => {
    fetchLeads();
  }, [fetchLeads]);

  const toggleSort = (column: "created_at" | "score" | "name") => {
    if (sortBy === column) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(column);
      setSortDir("desc");
    }
    setPage(0);
  };

  const openLead = async (lead: Lead) => {
    setSelectedLead(lead);
    setTimeline(null);
    setLeadAppointments([]);
    setLeadConversation(null);
    setTimelineLoading(true);
    try {
      const data = await apiFetch<{
        activity: LeadActivity[];
        appointments: Appointment[];
        conversation: Conversation | null;
      }>(`/api/admin/leads/${lead.id}?companyId=${lead.company_id}`);
      setTimeline(data.activity);
      setLeadAppointments(data.appointments);
      setLeadConversation(data.conversation);
    } catch (err) {
      showToast(err instanceof ApiClientError ? err.message : "Failed to load lead timeline", "error");
    } finally {
      setTimelineLoading(false);
    }
  };

  const changeStatus = async (lead: Lead, newStatus: LeadStatus) => {
    if (!activeCompanyId) return;
    try {
      const updated = await apiFetch<Lead>(`/api/admin/leads/${lead.id}`, {
        method: "PUT",
        body: JSON.stringify({ company_id: activeCompanyId, status: newStatus }),
      });
      setLeads((prev) => prev.map((l) => (l.id === updated.id ? updated : l)));
      showToast(`Lead marked as ${newStatus}`, "success");
    } catch (err) {
      showToast(err instanceof ApiClientError ? err.message : "Failed to update lead", "error");
    }
  };

  const changeOwner = async (ownerId: string) => {
    if (!activeCompanyId || !selectedLead) return;
    try {
      const updated = await apiFetch<Lead>(`/api/admin/leads/${selectedLead.id}`, {
        method: "PUT",
        body: JSON.stringify({ company_id: activeCompanyId, owner_id: ownerId || null }),
      });
      setSelectedLead(updated);
      setLeads((prev) => prev.map((l) => (l.id === updated.id ? updated : l)));
      showToast("Owner updated", "success");
    } catch (err) {
      showToast(err instanceof ApiClientError ? err.message : "Failed to update owner", "error");
    }
  };

  const addTag = async () => {
    if (!activeCompanyId || !selectedLead || !tagInput.trim()) return;
    const nextTags = Array.from(new Set([...selectedLead.tags, tagInput.trim()]));
    try {
      const updated = await apiFetch<Lead>(`/api/admin/leads/${selectedLead.id}`, {
        method: "PUT",
        body: JSON.stringify({ company_id: activeCompanyId, tags: nextTags }),
      });
      setSelectedLead(updated);
      setLeads((prev) => prev.map((l) => (l.id === updated.id ? updated : l)));
      setTagInput("");
    } catch (err) {
      showToast(err instanceof ApiClientError ? err.message : "Failed to add tag", "error");
    }
  };

  const removeTag = async (tag: string) => {
    if (!activeCompanyId || !selectedLead) return;
    try {
      const updated = await apiFetch<Lead>(`/api/admin/leads/${selectedLead.id}`, {
        method: "PUT",
        body: JSON.stringify({ company_id: activeCompanyId, tags: selectedLead.tags.filter((t) => t !== tag) }),
      });
      setSelectedLead(updated);
      setLeads((prev) => prev.map((l) => (l.id === updated.id ? updated : l)));
    } catch (err) {
      showToast(err instanceof ApiClientError ? err.message : "Failed to remove tag", "error");
    }
  };

  const addNote = async () => {
    if (!activeCompanyId || !selectedLead || !noteInput.trim()) return;
    setSavingNote(true);
    try {
      const note = await apiFetch<LeadActivity>(`/api/admin/leads/${selectedLead.id}/notes`, {
        method: "POST",
        body: JSON.stringify({ company_id: activeCompanyId, content: noteInput.trim() }),
      });
      setTimeline((prev) => [note, ...(prev || [])]);
      setNoteInput("");
    } catch (err) {
      showToast(err instanceof ApiClientError ? err.message : "Failed to add note", "error");
    } finally {
      setSavingNote(false);
    }
  };

  const exportCSV = () => {
    if (leads.length === 0) {
      showToast("No leads on this page to export", "info");
      return;
    }
    const headers = "Name,Email,Phone,Business,Score,Category,Status,Created\n";
    const rows = leads
      .map(
        (l) =>
          `"${l.name}","${l.email}","${l.phone}","${l.business_name || ""}",${l.score},"${l.score_category}","${l.status}","${l.created_at}"`
      )
      .join("\n");

    const blob = new Blob([headers + rows], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `leads_export_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const [exportingAll, setExportingAll] = useState(false);
  const exportAllServerSide = async () => {
    if (!activeCompanyId) return;
    setExportingAll(true);
    try {
      const params = new URLSearchParams({ companyId: activeCompanyId });
      if (status !== "ALL") params.set("status", status);
      const data = await apiFetch<{ url: string; rowCount: number }>(`/api/admin/leads/export?${params.toString()}`);
      window.open(data.url, "_blank");
      showToast(`Exported ${data.rowCount} leads (all matching filters, not just this page)`, "success");
    } catch (err) {
      showToast(err instanceof ApiClientError ? err.message : "Export failed", "error");
    } finally {
      setExportingAll(false);
    }
  };

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / PAGE_SIZE)), [total]);

  if (companyLoading) {
    return <div className="text-sm text-slate-500">Loading workspace…</div>;
  }
  if (!activeCompanyId) {
    return <div className="text-sm text-slate-500">No company selected. Ask an admin to invite you to a company.</div>;
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 tracking-tight">Lead Qualification & CRM</h1>
          <p className="text-xs text-slate-400">View and manage leads automatically qualified by your AI Digital Twins.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="glass" onClick={exportCSV} className="flex items-center gap-2 text-xs">
            <Download className="h-4 w-4" />
            Export Page
          </Button>
          <Button variant="glass" onClick={exportAllServerSide} disabled={exportingAll} className="flex items-center gap-2 text-xs">
            {exportingAll ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            Export All
          </Button>
        </div>
      </div>

      <Card className="glass-panel border-white/[0.08] p-6 space-y-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
            <input
              type="text"
              placeholder="Search by lead name, email, or business…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="w-full rounded-xl bg-slate-900/80 border border-white/[0.08] pl-9 pr-4 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500"
            />
          </div>
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as Lead["status"] | "ALL");
              setPage(0);
            }}
            className="rounded-xl bg-slate-900/80 border border-white/[0.08] px-3 py-2 text-xs text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500"
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s === "ALL" ? "All statuses" : s}
              </option>
            ))}
          </select>
        </div>

        {error && (
          <div className="flex items-center gap-2 text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="text-[11px] uppercase tracking-wider text-slate-500 border-b border-white/[0.08]">
              <tr>
                <SortableHeader label="Lead Details" column="name" sortBy={sortBy} sortDir={sortDir} onSort={toggleSort} />
                <th className="pb-3 font-semibold">Company / Industry</th>
                <th className="pb-3 font-semibold">Score Category</th>
                <SortableHeader label="Score" column="score" sortBy={sortBy} sortDir={sortDir} onSort={toggleSort} />
                <th className="pb-3 font-semibold">Pain Point / Need</th>
                <th className="pb-3 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.06]">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-500">
                    <Loader2 className="h-4 w-4 animate-spin inline mr-2" />
                    Loading leads…
                  </td>
                </tr>
              ) : leads.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-500">
                    No leads match your filters yet.
                  </td>
                </tr>
              ) : (
                leads.map((lead) => (
                  <tr key={lead.id} className="hover:bg-white/[0.02] cursor-pointer" onClick={() => openLead(lead)}>
                    <td className="py-3">
                      <div className="font-semibold text-slate-100">{lead.name}</div>
                      <div className="text-[11px] text-slate-400">
                        {lead.email} • {lead.phone}
                      </div>
                    </td>
                    <td className="py-3 font-medium text-slate-300">{lead.business_name || "—"}</td>
                    <td className="py-3">
                      <Badge variant={lead.score_category === "HIGH" ? "success" : lead.score_category === "MEDIUM" ? "warning" : "default"}>
                        {lead.score_category}
                      </Badge>
                    </td>
                    <td className="py-3 font-mono font-bold text-sky-400">{lead.score}</td>
                    <td className="py-3 text-slate-400 max-w-xs truncate">{lead.problem_statement || "—"}</td>
                    <td className="py-3" onClick={(e) => e.stopPropagation()}>
                      <select
                        value={lead.status}
                        onChange={(e) => changeStatus(lead, e.target.value as LeadStatus)}
                        className="bg-transparent text-xs font-semibold text-emerald-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 rounded"
                      >
                        {STATUS_OPTIONS.filter((s) => s !== "ALL").map((s) => (
                          <option key={s} value={s} className="bg-[#0c111d] text-slate-100">
                            {s}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between text-xs text-slate-500 pt-2">
          <span>
            {total === 0 ? "0 leads" : `${page * PAGE_SIZE + 1}–${Math.min((page + 1) * PAGE_SIZE, total)} of ${total} leads`}
          </span>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>
              Previous
            </Button>
            <span>
              Page {page + 1} of {totalPages}
            </span>
            <Button variant="outline" size="sm" disabled={page + 1 >= totalPages} onClick={() => setPage((p) => p + 1)}>
              Next
            </Button>
          </div>
        </div>
      </Card>

      <Dialog
        open={!!selectedLead}
        onClose={() => setSelectedLead(null)}
        title={selectedLead?.name || ""}
        description={selectedLead ? `${selectedLead.email} • ${selectedLead.phone}` : undefined}
        size="lg"
      >
        {selectedLead && (
          <div className="space-y-4 text-sm">
            <div className="grid grid-cols-2 gap-4 text-xs">
              <div>
                <div className="text-slate-500 uppercase tracking-wide text-[10px] mb-1">Business</div>
                <div className="text-slate-200">{selectedLead.business_name || "—"}</div>
              </div>
              <div>
                <div className="text-slate-500 uppercase tracking-wide text-[10px] mb-1">Budget</div>
                <div className="text-slate-200">{selectedLead.budget ? `$${selectedLead.budget.toLocaleString()}` : "—"}</div>
              </div>
              <div>
                <div className="text-slate-500 uppercase tracking-wide text-[10px] mb-1">Timeline</div>
                <div className="text-slate-200">{selectedLead.timeline || "—"}</div>
              </div>
              <div>
                <div className="text-slate-500 uppercase tracking-wide text-[10px] mb-1">Score</div>
                <div className="text-slate-200">
                  {selectedLead.score} ({selectedLead.score_category})
                </div>
              </div>
            </div>
            {selectedLead.problem_statement && (
              <div>
                <div className="text-slate-500 uppercase tracking-wide text-[10px] mb-1">Problem Statement</div>
                <p className="text-slate-300">{selectedLead.problem_statement}</p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4 text-xs">
              <div>
                <div className="text-slate-500 uppercase tracking-wide text-[10px] mb-1">Owner</div>
                <select
                  value={selectedLead.owner_id || ""}
                  onChange={(e) => changeOwner(e.target.value)}
                  className="dashboard-input"
                >
                  <option value="">Unassigned</option>
                  {members.map((m) => (
                    <option key={m.user_id} value={m.user_id}>
                      {m.user?.full_name || m.user?.email || m.user_id}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <div className="text-slate-500 uppercase tracking-wide text-[10px] mb-1">Tags</div>
                <div className="flex flex-wrap gap-1 mb-1">
                  {selectedLead.tags.map((tag) => (
                    <Badge key={tag} variant="outline" className="cursor-pointer" onClick={() => removeTag(tag)}>
                      {tag} ×
                    </Badge>
                  ))}
                </div>
                <div className="flex gap-1">
                  <input
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && addTag()}
                    placeholder="Add tag…"
                    className="dashboard-input"
                  />
                  <Button variant="outline" size="sm" onClick={addTag}>
                    Add
                  </Button>
                </div>
              </div>
            </div>
            {leadConversation && (
              <div>
                <div className="text-slate-500 uppercase tracking-wide text-[10px] mb-1">Conversation Summary</div>
                <p className="text-slate-300">{leadConversation.summary || "No summary generated for this call."}</p>
                <div className="text-slate-600 text-[11px] mt-1">
                  {leadConversation.duration_seconds ? `${leadConversation.duration_seconds}s` : ""}
                  {leadConversation.sentiment ? ` • sentiment: ${leadConversation.sentiment}` : ""}
                </div>
              </div>
            )}
            {leadAppointments.length > 0 && (
              <div>
                <div className="text-slate-500 uppercase tracking-wide text-[10px] mb-2">Appointment History</div>
                <ul className="space-y-1.5">
                  {leadAppointments.map((appt) => (
                    <li key={appt.id} className="flex items-center justify-between text-xs">
                      <span className="text-slate-300">{new Date(appt.start_time).toLocaleString()}</span>
                      <Badge variant={appt.status === "COMPLETED" ? "success" : appt.status === "CANCELLED" ? "danger" : "default"}>
                        {appt.status}
                      </Badge>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div>
              <div className="text-slate-500 uppercase tracking-wide text-[10px] mb-2">Add Note</div>
              <div className="flex gap-2">
                <input
                  value={noteInput}
                  onChange={(e) => setNoteInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addNote()}
                  placeholder="Leave a note for the team…"
                  className="dashboard-input"
                />
                <Button variant="outline" size="sm" onClick={addNote} disabled={savingNote}>
                  {savingNote ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Add"}
                </Button>
              </div>
            </div>

            <div>
              <div className="text-slate-500 uppercase tracking-wide text-[10px] mb-2">Activity Timeline</div>
              {timelineLoading ? (
                <div className="text-xs text-slate-500">
                  <Loader2 className="h-3.5 w-3.5 animate-spin inline mr-2" />
                  Loading…
                </div>
              ) : !timeline || timeline.length === 0 ? (
                <div className="text-xs text-slate-500">No activity recorded yet.</div>
              ) : (
                <ul className="space-y-2 border-l border-white/[0.08] pl-4">
                  {timeline.map((entry) => (
                    <li key={entry.id} className="text-xs">
                      <div className="text-slate-300">{entry.content || entry.type}</div>
                      <div className="text-slate-600">{new Date(entry.created_at).toLocaleString()}</div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
}

function SortableHeader({
  label,
  column,
  sortBy,
  sortDir,
  onSort,
}: {
  label: string;
  column: "created_at" | "score" | "name";
  sortBy: string;
  sortDir: "asc" | "desc";
  onSort: (column: "created_at" | "score" | "name") => void;
}) {
  const active = sortBy === column;
  return (
    <th className="pb-3 font-semibold">
      <button
        onClick={() => onSort(column)}
        className={`flex items-center gap-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 rounded ${
          active ? "text-sky-400" : ""
        }`}
      >
        {label}
        <ArrowUpDown className="h-3 w-3" />
        {active && <span className="sr-only">{sortDir === "asc" ? "ascending" : "descending"}</span>}
      </button>
    </th>
  );
}
