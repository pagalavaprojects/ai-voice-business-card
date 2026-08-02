"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Package, CheckCircle2, EyeOff, Star, Plus, Loader2, Search, Copy, Pencil, Trash2, Download } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/shared/ui/card";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Dialog } from "@/shared/ui/dialog";
import { useToast } from "@/shared/ui/toast";
import { useCompany } from "@/features/dashboard/context/CompanyContext";
import { apiFetch, ApiClientError } from "@/shared/lib/apiClient";
import { Product } from "@/core/domain/models/types";
import { ProductForm, payloadFromValues } from "@/features/dashboard/components/products/ProductForm";
import { toCsv, downloadCsv } from "@/shared/lib/csv";

interface ProductStats {
  total: number;
  active: number;
  inactive: number;
  featured: number;
  addedLast30Days: number;
}

interface ListResponse {
  products: Product[];
  total: number;
  stats: ProductStats;
}

const PAGE_SIZE = 20;

/** Product images live in a public bucket, so the URL is derivable on the
 * client without a round trip per image. */
function publicUrlOf(path: string): string {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  return `${base}/storage/v1/object/public/product-images/${path}`;
}

export default function ProductsPage() {
  const { activeCompanyId, loading: companyLoading } = useCompany();
  const { showToast } = useToast();

  const [data, setData] = useState<ListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [status, setStatus] = useState<"" | "active" | "inactive">("");
  const [sortBy, setSortBy] = useState<"updated_at" | "name" | "pricing" | "display_order">("updated_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(0);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [deleting, setDeleting] = useState<Product | null>(null);
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

  const fetchProducts = useCallback(async () => {
    if (!activeCompanyId) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        companyId: activeCompanyId,
        limit: String(PAGE_SIZE),
        offset: String(page * PAGE_SIZE),
        sortBy,
        sortDir,
      });
      if (debouncedSearch) params.set("search", debouncedSearch);
      if (status) params.set("status", status);
      setData(await apiFetch<ListResponse>(`/api/admin/products?${params}`));
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Failed to load products");
    } finally {
      setLoading(false);
    }
  }, [activeCompanyId, page, sortBy, sortDir, debouncedSearch, status]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  // Selection is cleared whenever the visible set changes, so a bulk action can
  // never apply to rows the admin can no longer see.
  useEffect(() => {
    setSelected(new Set());
  }, [debouncedSearch, status, page, sortBy, sortDir]);

  const products = useMemo(() => data?.products ?? [], [data]);
  const allVisibleSelected = products.length > 0 && products.every((p) => selected.has(p.id));

  const toggleAll = () => {
    setSelected(allVisibleSelected ? new Set() : new Set(products.map((p) => p.id)));
  };
  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const runBulk = async (action: "activate" | "deactivate" | "delete") => {
    if (!activeCompanyId || selected.size === 0) return;
    setBusy(true);
    try {
      const result = await apiFetch<{ affected: number }>("/api/admin/products/bulk", {
        method: "POST",
        body: JSON.stringify({ company_id: activeCompanyId, action, ids: [...selected] }),
      });
      showToast(`${result.affected} product${result.affected === 1 ? "" : "s"} ${action}d`, "success");
      setSelected(new Set());
      await fetchProducts();
    } catch (err) {
      showToast(err instanceof ApiClientError ? err.message : `Bulk ${action} failed`, "error");
    } finally {
      setBusy(false);
    }
  };

  const exportSelected = () => {
    const rows = products.filter((p) => selected.has(p.id));
    const source = rows.length > 0 ? rows : products;
    if (source.length === 0) return;
    const csv = toCsv(
      ["Name", "SKU", "Category", "Price", "Currency", "Discount %", "Status", "Featured", "Updated"],
      source.map((p) => [
        p.name,
        p.sku ?? "",
        p.category ?? "",
        p.pricing,
        p.currency,
        p.discount_percent ?? 0,
        p.is_active ? "Active" : "Inactive",
        p.is_featured ? "Yes" : "No",
        new Date(p.updated_at).toISOString().slice(0, 10),
      ])
    );
    downloadCsv(`products-${new Date().toISOString().slice(0, 10)}.csv`, csv);
    showToast(`Exported ${source.length} product${source.length === 1 ? "" : "s"}`, "success");
  };

  const submitCreate = async (payload: ReturnType<typeof payloadFromValues>) => {
    if (!activeCompanyId) return;
    setSubmitting(true);
    setFormError(null);
    try {
      await apiFetch<Product>("/api/admin/products", {
        method: "POST",
        body: JSON.stringify({ ...payload, company_id: activeCompanyId }),
      });
      showToast("Product created", "success");
      setCreateOpen(false);
      await fetchProducts();
    } catch (err) {
      setFormError(err instanceof ApiClientError ? err.message : "Failed to create product");
    } finally {
      setSubmitting(false);
    }
  };

  const submitEdit = async (payload: ReturnType<typeof payloadFromValues>) => {
    if (!activeCompanyId || !editing) return;
    setSubmitting(true);
    setFormError(null);
    try {
      await apiFetch<Product>(`/api/admin/products/${editing.id}`, {
        method: "PUT",
        body: JSON.stringify({ ...payload, company_id: activeCompanyId }),
      });
      showToast("Product updated", "success");
      setEditing(null);
      await fetchProducts();
    } catch (err) {
      setFormError(err instanceof ApiClientError ? err.message : "Failed to update product");
    } finally {
      setSubmitting(false);
    }
  };

  const duplicate = async (product: Product) => {
    if (!activeCompanyId) return;
    setBusy(true);
    try {
      await apiFetch<Product>(`/api/admin/products/${product.id}/duplicate`, {
        method: "POST",
        body: JSON.stringify({ company_id: activeCompanyId }),
      });
      showToast("Duplicated — the copy is inactive until you publish it", "success");
      await fetchProducts();
    } catch (err) {
      showToast(err instanceof ApiClientError ? err.message : "Duplicate failed", "error");
    } finally {
      setBusy(false);
    }
  };

  const confirmDelete = async () => {
    if (!activeCompanyId || !deleting) return;
    setBusy(true);
    try {
      await apiFetch(`/api/admin/products/${deleting.id}?companyId=${activeCompanyId}`, { method: "DELETE" });
      showToast("Product deleted", "success");
      setDeleting(null);
      await fetchProducts();
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
          <h1 className="text-2xl font-bold text-slate-100 tracking-tight">Products</h1>
          <p className="text-xs text-slate-400">Active products appear on the business card and are available to the AI assistant.</p>
        </div>
        <Button variant="default" onClick={() => { setFormError(null); setCreateOpen(true); }} className="flex items-center gap-2 text-xs">
          <Plus className="h-4 w-4" aria-hidden="true" />
          New product
        </Button>
      </div>

      {data && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          <Stat title="Total" value={data.stats.total} icon={<Package className="h-4 w-4 text-sky-400" />} />
          <Stat title="Active" value={data.stats.active} icon={<CheckCircle2 className="h-4 w-4 text-emerald-400" />} />
          <Stat title="Inactive" value={data.stats.inactive} icon={<EyeOff className="h-4 w-4 text-slate-400" />} />
          <Stat title="Featured" value={data.stats.featured} icon={<Star className="h-4 w-4 text-amber-400" />} />
          <Stat title="Added (30d)" value={data.stats.addedLast30Days} icon={<Plus className="h-4 w-4 text-indigo-400" />} />
        </div>
      )}

      <Card className="glass-panel border-white/[0.08] p-4 sm:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500" aria-hidden="true" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, SKU, category…"
              aria-label="Search products"
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
            aria-label="Sort products"
            className="dashboard-input sm:w-48"
          >
            <option value="updated_at:desc">Recently updated</option>
            <option value="name:asc">Name A–Z</option>
            <option value="pricing:desc">Price high → low</option>
            <option value="pricing:asc">Price low → high</option>
            <option value="display_order:asc">Display order</option>
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
              <Button variant="outline" size="sm" disabled={busy} onClick={() => runBulk("delete")} className="text-xs text-rose-300">Delete</Button>
            </div>
          </div>
        )}

        {error && <div role="alert" className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs">{error}</div>}

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-slate-400 py-8 justify-center" role="status" aria-live="polite">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            Loading products…
          </div>
        ) : products.length === 0 ? (
          <div className="text-center py-10 text-sm text-slate-400">
            {debouncedSearch || status ? "No products match your filters." : "No products yet. Create your first one — it appears on the business card immediately."}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-[10px] uppercase tracking-wider text-slate-400 border-b border-white/[0.08]">
                <tr>
                  <th scope="col" className="pb-3 pr-3 w-8">
                    <input type="checkbox" checked={allVisibleSelected} onChange={toggleAll} aria-label="Select all products on this page" />
                  </th>
                  <th scope="col" className="pb-3 font-semibold">Product</th>
                  <th scope="col" className="pb-3 font-semibold">Category</th>
                  <th scope="col" className="pb-3 font-semibold text-right">Price</th>
                  <th scope="col" className="pb-3 font-semibold">Status</th>
                  <th scope="col" className="pb-3 font-semibold">Updated</th>
                  <th scope="col" className="pb-3 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.06]">
                {products.map((p) => (
                  <tr key={p.id} className={selected.has(p.id) ? "bg-sky-500/[0.05]" : undefined}>
                    <td className="py-3 pr-3">
                      <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggleOne(p.id)} aria-label={`Select ${p.name}`} />
                    </td>
                    <td className="py-3">
                      <div className="flex items-center gap-2.5 min-w-0">
                        {p.image_path ? (
                          /* eslint-disable-next-line @next/next/no-img-element */
                          <img src={publicUrlOf(p.image_path)} alt="" className="h-9 w-9 rounded-lg object-cover border border-white/[0.08] shrink-0" loading="lazy" />
                        ) : (
                          <div className="h-9 w-9 rounded-lg bg-white/[0.04] border border-white/[0.08] flex items-center justify-center shrink-0" aria-hidden="true">
                            <Package className="h-4 w-4 text-slate-600" />
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="font-medium text-slate-100 truncate flex items-center gap-1.5">
                            {p.name}
                            {p.is_featured && <Star className="h-3 w-3 text-amber-400 shrink-0" aria-label="Featured" />}
                          </p>
                          {p.sku && <p className="text-[10px] text-slate-500 font-mono">{p.sku}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="py-3 text-slate-400">{p.category || "—"}</td>
                    <td className="py-3 text-right font-mono text-slate-200 tabular-nums">
                      {p.currency === "USD" ? "$" : `${p.currency} `}
                      {p.pricing}
                    </td>
                    <td className="py-3">
                      <Badge variant={p.is_active ? "success" : "outline"}>{p.is_active ? "Active" : "Inactive"}</Badge>
                    </td>
                    <td className="py-3 text-slate-400 whitespace-nowrap">{new Date(p.updated_at).toLocaleDateString()}</td>
                    <td className="py-3">
                      <div className="flex items-center justify-end gap-1">
                        <IconButton label={`Edit ${p.name}`} onClick={() => { setFormError(null); setEditing(p); }}><Pencil className="h-3.5 w-3.5" /></IconButton>
                        <IconButton label={`Duplicate ${p.name}`} onClick={() => duplicate(p)} disabled={busy}><Copy className="h-3.5 w-3.5" /></IconButton>
                        <IconButton label={`Delete ${p.name}`} onClick={() => setDeleting(p)} danger><Trash2 className="h-3.5 w-3.5" /></IconButton>
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

      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} title="New product" description="Active products appear on the business card immediately." size="lg">
        <ProductForm
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
          <ProductForm
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

      <Dialog open={Boolean(deleting)} onClose={() => setDeleting(null)} title="Delete product?" size="sm">
        <div className="space-y-4 text-sm">
          <p className="text-xs text-slate-300">
            <strong className="text-slate-100">{deleting?.name}</strong> will be removed from the business card and the AI assistant. This is a soft
            delete — the record is retained and can be restored from the database.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setDeleting(null)}>Cancel</Button>
            <Button variant="default" size="sm" disabled={busy} onClick={confirmDelete} className="bg-rose-500/80 hover:bg-rose-500">
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : "Delete"}
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}

function Stat({ title, value, icon }: { title: string; value: number; icon: React.ReactNode }) {
  return (
    <Card className="glass-panel border-white/[0.08]">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-xs font-semibold text-slate-400">{title}</CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-extrabold text-slate-100 font-mono tabular-nums">{value}</div>
      </CardContent>
    </Card>
  );
}

function IconButton({ label, onClick, children, disabled, danger }: { label: string; onClick: () => void; children: React.ReactNode; disabled?: boolean; danger?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={`h-7 w-7 rounded-lg flex items-center justify-center border border-white/[0.08] bg-white/[0.03] transition-colors focus:outline-none focus:ring-2 focus:ring-sky-500 disabled:opacity-40 ${
        danger ? "text-slate-400 hover:text-rose-300 hover:border-rose-400/30" : "text-slate-400 hover:text-sky-300 hover:border-sky-400/30"
      }`}
    >
      {children}
    </button>
  );
}
