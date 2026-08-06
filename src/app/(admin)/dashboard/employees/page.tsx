"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Users, CheckCircle2, EyeOff, Mic, Plus, Loader2, Search, Pencil, Trash2, Download, ExternalLink, Link2, User } from "lucide-react";
import { Card } from "@/shared/ui/card";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Dialog } from "@/shared/ui/dialog";
import { useToast } from "@/shared/ui/toast";
import { useCompany } from "@/features/dashboard/context/CompanyContext";
import { apiFetch, ApiClientError } from "@/shared/lib/apiClient";
import { Employee } from "@/core/domain/models/types";
import { EmployeeForm, payloadFromValues } from "@/features/dashboard/components/employees/EmployeeForm";
import { toCsv, downloadCsv } from "@/shared/lib/csv";
import { StatTile, IconButton, makePublicUrlResolver } from "@/features/dashboard/components/catalog/CatalogFormPrimitives";

interface EmployeeStats {
  total: number;
  active: number;
  inactive: number;
  withAgent: number;
  addedLast30Days: number;
}

interface ListResponse {
  employees: Employee[];
  total: number;
  stats: EmployeeStats;
}

const PAGE_SIZE = 20;

const publicUrlOf = makePublicUrlResolver("employee-avatars");

export default function EmployeesPage() {
  const { activeCompanyId, loading: companyLoading } = useCompany();
  const { showToast } = useToast();

  const [data, setData] = useState<ListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [status, setStatus] = useState<"" | "active" | "inactive">("");
  const [sortBy, setSortBy] = useState<"display_order" | "name" | "designation" | "updated_at">("display_order");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(0);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<Employee | null>(null);
  const [deleting, setDeleting] = useState<Employee | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Debounced so typing doesn't fire a query per keystroke.
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(0);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const fetchEmployees = useCallback(async () => {
    if (!activeCompanyId) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        companyId: activeCompanyId,
        // Opts into the paginated { employees, total, stats } shape; without it
        // the route returns the bare array its older callers still expect.
        view: "table",
        limit: String(PAGE_SIZE),
        offset: String(page * PAGE_SIZE),
        sortBy,
        sortDir,
      });
      if (debouncedSearch) params.set("search", debouncedSearch);
      if (status) params.set("status", status);
      setData(await apiFetch<ListResponse>(`/api/admin/employees?${params}`));
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Failed to load employees");
    } finally {
      setLoading(false);
    }
  }, [activeCompanyId, page, sortBy, sortDir, debouncedSearch, status]);

  useEffect(() => {
    fetchEmployees();
  }, [fetchEmployees]);

  // Selection is cleared whenever the visible set changes, so a bulk action can
  // never apply to rows the admin can no longer see.
  useEffect(() => {
    setSelected(new Set());
  }, [debouncedSearch, status, page, sortBy, sortDir]);

  const employees = useMemo(() => data?.employees ?? [], [data]);
  const allVisibleSelected = employees.length > 0 && employees.every((e) => selected.has(e.id));

  const toggleAll = () => {
    setSelected(allVisibleSelected ? new Set() : new Set(employees.map((e) => e.id)));
  };
  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  /** The short /c/{slug} link when one is set (what should actually get
   * shared/printed), otherwise the permanent /{companyId}/{employeeId} URL —
   * both derivable client-side on this same origin, no extra round trip. */
  const cardUrlOf = (employee: Employee) =>
    typeof window === "undefined"
      ? ""
      : `${window.location.origin}${employee.slug ? `/c/${employee.slug}` : `/${employee.company_id}/${employee.id}`}`;

  const copyCardUrl = async (employee: Employee) => {
    try {
      await navigator.clipboard.writeText(cardUrlOf(employee));
      showToast("Card link copied", "success");
    } catch {
      // Clipboard access is denied in some browsers/contexts. Say so rather
      // than showing a success toast for something that did not happen.
      showToast("Could not copy — your browser blocked clipboard access", "error");
    }
  };

  const runBulk = async (action: "activate" | "deactivate" | "delete") => {
    if (!activeCompanyId || selected.size === 0) return;
    setBusy(true);
    try {
      const result = await apiFetch<{ affected: number }>("/api/admin/employees/bulk", {
        method: "POST",
        body: JSON.stringify({ company_id: activeCompanyId, action, ids: [...selected] }),
      });
      showToast(`${result.affected} employee${result.affected === 1 ? "" : "s"} ${action}d`, "success");
      setSelected(new Set());
      await fetchEmployees();
    } catch (err) {
      showToast(err instanceof ApiClientError ? err.message : `Bulk ${action} failed`, "error");
    } finally {
      setBusy(false);
    }
  };

  const exportSelected = () => {
    const rows = employees.filter((e) => selected.has(e.id));
    const source = rows.length > 0 ? rows : employees;
    if (source.length === 0) return;
    const csv = toCsv(
      ["Name", "Designation", "Email", "Phone", "Status", "Card URL", "Updated"],
      source.map((e) => [
        e.name,
        e.designation,
        e.email,
        e.phone,
        e.is_active ? "Active" : "Inactive",
        cardUrlOf(e),
        new Date(e.updated_at).toISOString().slice(0, 10),
      ])
    );
    downloadCsv(`employees-${new Date().toISOString().slice(0, 10)}.csv`, csv);
    showToast(`Exported ${source.length} employee${source.length === 1 ? "" : "s"}`, "success");
  };

  const submitCreate = async (payload: ReturnType<typeof payloadFromValues>) => {
    if (!activeCompanyId) return;
    setSubmitting(true);
    setFormError(null);
    try {
      await apiFetch<Employee>("/api/admin/employees", {
        method: "POST",
        body: JSON.stringify({ ...payload, company_id: activeCompanyId }),
      });
      showToast("Employee created", "success");
      setCreateOpen(false);
      await fetchEmployees();
    } catch (err) {
      setFormError(err instanceof ApiClientError ? err.message : "Failed to create employee");
    } finally {
      setSubmitting(false);
    }
  };

  const submitEdit = async (payload: ReturnType<typeof payloadFromValues>) => {
    if (!activeCompanyId || !editing) return;
    setSubmitting(true);
    setFormError(null);
    try {
      await apiFetch<Employee>(`/api/admin/employees/${editing.id}`, {
        method: "PUT",
        body: JSON.stringify({ ...payload, company_id: activeCompanyId }),
      });
      showToast("Employee updated", "success");
      setEditing(null);
      await fetchEmployees();
    } catch (err) {
      setFormError(err instanceof ApiClientError ? err.message : "Failed to update employee");
    } finally {
      setSubmitting(false);
    }
  };

  const confirmDelete = async () => {
    if (!activeCompanyId || !deleting) return;
    setBusy(true);
    try {
      await apiFetch(`/api/admin/employees/${deleting.id}?companyId=${activeCompanyId}`, { method: "DELETE" });
      showToast("Employee removed", "success");
      setDeleting(null);
      await fetchEmployees();
    } catch (err) {
      showToast(err instanceof ApiClientError ? err.message : "Delete failed", "error");
    } finally {
      setBusy(false);
    }
  };

  if (companyLoading) return <div className="text-sm text-slate-400">Loading workspace…</div>;
  if (!activeCompanyId) return <div className="text-sm text-slate-400">No company selected.</div>;

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 tracking-tight">Employees</h1>
          <p className="text-xs text-slate-400">Each active employee gets a voice business card. Deactivating one takes their card offline.</p>
        </div>
        <Button variant="default" onClick={() => { setFormError(null); setCreateOpen(true); }} className="flex items-center gap-2 text-xs">
          <Plus className="h-4 w-4" aria-hidden="true" />
          New employee
        </Button>
      </div>

      {data && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          <StatTile title="Total" value={data.stats.total} icon={<Users className="h-4 w-4 text-sky-400" />} />
          <StatTile title="Active" value={data.stats.active} icon={<CheckCircle2 className="h-4 w-4 text-emerald-400" />} />
          <StatTile title="Inactive" value={data.stats.inactive} icon={<EyeOff className="h-4 w-4 text-slate-400" />} />
          <StatTile title="With voice agent" value={data.stats.withAgent} icon={<Mic className="h-4 w-4 text-violet-400" />} />
          <StatTile title="Added (30d)" value={data.stats.addedLast30Days} icon={<Plus className="h-4 w-4 text-indigo-400" />} />
        </div>
      )}

      <Card className="glass-panel border-white/[0.08] p-4 sm:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500" aria-hidden="true" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, designation, email…"
              aria-label="Search employees"
              className="dashboard-input pl-9"
            />
          </div>
          <select value={status} onChange={(e) => { setStatus(e.target.value as typeof status); setPage(0); }} aria-label="Filter by status" className="dashboard-input sm:w-40">
            <option value="">All statuses</option>
            <option value="active">Active only</option>
            <option value="inactive">Inactive only</option>
          </select>
          <select
            value={`${sortBy}:${sortDir}`}
            onChange={(e) => {
              const [by, dir] = e.target.value.split(":");
              setSortBy(by as typeof sortBy);
              setSortDir(dir as typeof sortDir);
            }}
            aria-label="Sort employees"
            className="dashboard-input sm:w-48"
          >
            <option value="display_order:asc">Display order</option>
            <option value="name:asc">Name A–Z</option>
            <option value="designation:asc">Designation A–Z</option>
            <option value="updated_at:desc">Recently updated</option>
          </select>
          <Button variant="glass" onClick={exportSelected} className="text-xs flex items-center gap-2 shrink-0">
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
            Export CSV
          </Button>
        </div>

        {selected.size > 0 && (
          <div className="flex flex-wrap items-center gap-2 p-3 rounded-xl bg-sky-500/[0.08] border border-sky-400/20" role="region" aria-label="Bulk actions">
            <span className="text-xs text-sky-200 font-semibold">{selected.size} selected</span>
            <div className="flex gap-2 ml-auto">
              <Button variant="outline" size="sm" disabled={busy} onClick={() => runBulk("activate")} className="text-xs">Activate</Button>
              <Button variant="outline" size="sm" disabled={busy} onClick={() => runBulk("deactivate")} className="text-xs">Deactivate</Button>
              <Button variant="outline" size="sm" disabled={busy} onClick={() => runBulk("delete")} className="text-xs text-rose-300">Remove</Button>
            </div>
          </div>
        )}

        {error && <div role="alert" className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs">{error}</div>}

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-slate-400 py-8 justify-center" role="status" aria-live="polite">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            Loading employees…
          </div>
        ) : employees.length === 0 ? (
          <div className="text-center py-10 text-sm text-slate-400">
            {debouncedSearch || status ? "No employees match your filters." : "No employees yet. Add the first one to publish a voice business card."}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-[10px] uppercase tracking-wider text-slate-400 border-b border-white/[0.08]">
                <tr>
                  <th scope="col" className="pb-3 pr-3 w-8">
                    <input type="checkbox" checked={allVisibleSelected} onChange={toggleAll} aria-label="Select all employees on this page" />
                  </th>
                  <th scope="col" className="pb-3 font-semibold">Employee</th>
                  <th scope="col" className="pb-3 font-semibold">Designation</th>
                  <th scope="col" className="pb-3 font-semibold">Contact</th>
                  <th scope="col" className="pb-3 font-semibold">Voice</th>
                  <th scope="col" className="pb-3 font-semibold">Status</th>
                  <th scope="col" className="pb-3 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.06]">
                {employees.map((e) => (
                  <tr key={e.id} className={selected.has(e.id) ? "bg-sky-500/[0.05]" : undefined}>
                    <td className="py-3 pr-3">
                      <input type="checkbox" checked={selected.has(e.id)} onChange={() => toggleOne(e.id)} aria-label={`Select ${e.name}`} />
                    </td>
                    <td className="py-3">
                      <div className="flex items-center gap-2.5 min-w-0">
                        {e.avatar_path ? (
                          /* eslint-disable-next-line @next/next/no-img-element */
                          <img src={publicUrlOf(e.avatar_path)} alt="" className="h-9 w-9 rounded-full object-cover border border-white/[0.08] shrink-0" loading="lazy" />
                        ) : (
                          <div className="h-9 w-9 rounded-full bg-white/[0.04] border border-white/[0.08] flex items-center justify-center shrink-0" aria-hidden="true">
                            <User className="h-4 w-4 text-slate-600" />
                          </div>
                        )}
                        <p className="font-medium text-slate-100 truncate">{e.name}</p>
                      </div>
                    </td>
                    <td className="py-3 text-slate-400">{e.designation || "—"}</td>
                    <td className="py-3 text-slate-400">
                      <span className="block truncate max-w-[14rem]">{e.email}</span>
                      <span className="block text-slate-500">{e.phone}</span>
                    </td>
                    <td className="py-3 text-slate-400">{e.voice_id || <span className="text-slate-600">inherited</span>}</td>
                    <td className="py-3">
                      <Badge variant={e.is_active ? "success" : "outline"}>{e.is_active ? "Active" : "Inactive"}</Badge>
                    </td>
                    <td className="py-3">
                      <div className="flex items-center justify-end gap-1">
                        <IconButton label={`Copy card link for ${e.name}`} onClick={() => copyCardUrl(e)}><Link2 className="h-3.5 w-3.5" /></IconButton>
                        <IconButton label={`Open ${e.name}'s card`} onClick={() => window.open(cardUrlOf(e), "_blank", "noopener,noreferrer")}><ExternalLink className="h-3.5 w-3.5" /></IconButton>
                        <IconButton label={`Edit ${e.name}`} onClick={() => { setFormError(null); setEditing(e); }}><Pencil className="h-3.5 w-3.5" /></IconButton>
                        <IconButton label={`Remove ${e.name}`} onClick={() => setDeleting(e)} danger><Trash2 className="h-3.5 w-3.5" /></IconButton>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {data && data.total > PAGE_SIZE && (
          <div className="flex items-center justify-between pt-2 border-t border-white/[0.06]">
            <span className="text-[11px] text-slate-400">
              {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, data.total)} of {data.total}
            </span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)} className="text-xs">Previous</Button>
              <Button variant="outline" size="sm" disabled={page + 1 >= totalPages} onClick={() => setPage((p) => p + 1)} className="text-xs">Next</Button>
            </div>
          </div>
        )}
      </Card>

      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} title="New employee" description="An active employee's card goes live as soon as you save." size="lg">
        <EmployeeForm
          companyId={activeCompanyId}
          initial={null}
          submitting={submitting}
          serverError={formError}
          onSubmit={submitCreate}
          onCancel={() => setCreateOpen(false)}
          publicUrlOf={publicUrlOf}
        />
      </Dialog>

      <Dialog open={Boolean(editing)} onClose={() => setEditing(null)} title={editing ? `Edit ${editing.name}` : ""} size="lg">
        {editing && (
          <EmployeeForm
            companyId={activeCompanyId}
            initial={editing}
            submitting={submitting}
            serverError={formError}
            onSubmit={submitEdit}
            onCancel={() => setEditing(null)}
            publicUrlOf={publicUrlOf}
          />
        )}
      </Dialog>

      <Dialog open={Boolean(deleting)} onClose={() => setDeleting(null)} title="Remove employee?" size="sm">
        <div className="space-y-4 text-sm">
          <p className="text-xs text-slate-300">
            <strong className="text-slate-100">{deleting?.name}</strong>&apos;s business card will stop answering and the card link will return
            &ldquo;not found&rdquo;. This is a soft delete — their conversations, leads and appointments are kept, and the record can be restored from
            the database.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setDeleting(null)}>Cancel</Button>
            <Button variant="default" size="sm" disabled={busy} onClick={confirmDelete} className="bg-rose-500/80 hover:bg-rose-500">
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : "Remove"}
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
