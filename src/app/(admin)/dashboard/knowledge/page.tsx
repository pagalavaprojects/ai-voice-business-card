"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Upload, Trash2, RefreshCw, Search, Loader2, FileText, AlertCircle, CheckCircle2 } from "lucide-react";
import { Card } from "@/shared/ui/card";
import { Button } from "@/shared/ui/button";
import { Badge } from "@/shared/ui/badge";
import { useToast } from "@/shared/ui/toast";
import { useCompany } from "@/features/dashboard/context/CompanyContext";
import { apiFetch, ApiClientError } from "@/shared/lib/apiClient";
import { KnowledgeChunk, KnowledgeDocument } from "@/core/domain/models/types";

const STATUS_VARIANT: Record<KnowledgeDocument["status"], "success" | "warning" | "danger" | "default"> = {
  READY: "success",
  PENDING: "default",
  CHUNKING: "warning",
  EMBEDDING: "warning",
  FAILED: "danger",
};

export default function KnowledgeBasePage() {
  const { activeCompanyId, loading: companyLoading } = useCompany();
  const { showToast } = useToast();

  const [documents, setDocuments] = useState<KnowledgeDocument[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [searchTerm, setSearchTerm] = useState("");
  const [searchMode, setSearchMode] = useState<"vector" | "text" | null>(null);
  const [searchResults, setSearchResults] = useState<KnowledgeChunk[] | null>(null);
  const [searching, setSearching] = useState(false);

  const fetchDocuments = useCallback(async () => {
    if (!activeCompanyId) return;
    setLoading(true);
    try {
      const data = await apiFetch<{ documents: KnowledgeDocument[] }>(`/api/admin/knowledge?companyId=${activeCompanyId}`);
      setDocuments(data.documents);
    } catch (err) {
      showToast(err instanceof ApiClientError ? err.message : "Failed to load documents", "error");
    } finally {
      setLoading(false);
    }
  }, [activeCompanyId, showToast]);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  const handleUpload = async (file: File) => {
    if (!activeCompanyId) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append("companyId", activeCompanyId);
      form.append("file", file);
      const res = await fetch("/api/admin/knowledge", { method: "POST", body: form });
      const json = await res.json();
      if (!res.ok || !json.success) throw new ApiClientError(res.status, json.message);

      setDocuments((prev) => [json.data.document, ...prev]);
      showToast(json.message, json.data.indexResult.embedded ? "success" : "info");
    } catch (err) {
      showToast(err instanceof ApiClientError ? err.message : "Upload failed", "error");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleDelete = async (doc: KnowledgeDocument) => {
    if (!activeCompanyId) return;
    setBusyId(doc.id);
    try {
      await apiFetch(`/api/admin/knowledge/${doc.id}?companyId=${activeCompanyId}`, { method: "DELETE" });
      setDocuments((prev) => prev.filter((d) => d.id !== doc.id));
      showToast("Document deleted", "success");
    } catch (err) {
      showToast(err instanceof ApiClientError ? err.message : "Delete failed", "error");
    } finally {
      setBusyId(null);
    }
  };

  const handleReindex = async (doc: KnowledgeDocument) => {
    if (!activeCompanyId) return;
    setBusyId(doc.id);
    try {
      const data = await apiFetch<{ document: KnowledgeDocument }>(`/api/admin/knowledge/${doc.id}/reindex`, {
        method: "POST",
        body: JSON.stringify({ company_id: activeCompanyId }),
      });
      setDocuments((prev) => prev.map((d) => (d.id === doc.id ? data.document : d)));
      showToast("Document reindexed", "success");
    } catch (err) {
      showToast(err instanceof ApiClientError ? err.message : "Reindex failed", "error");
    } finally {
      setBusyId(null);
    }
  };

  const runSearch = async () => {
    if (!activeCompanyId || searchTerm.trim().length < 2) return;
    setSearching(true);
    try {
      const data = await apiFetch<{ mode: "vector" | "text"; results: KnowledgeChunk[] }>(
        `/api/admin/knowledge/search?companyId=${activeCompanyId}&q=${encodeURIComponent(searchTerm)}`
      );
      setSearchResults(data.results);
      setSearchMode(data.mode);
    } catch (err) {
      showToast(err instanceof ApiClientError ? err.message : "Search failed", "error");
    } finally {
      setSearching(false);
    }
  };

  const readyCount = documents.filter((d) => d.status === "READY").length;
  const totalChunks = documents.reduce((sum, d) => sum + d.chunk_count, 0);

  if (companyLoading) return <div className="text-sm text-slate-500">Loading workspace…</div>;
  if (!activeCompanyId) return <div className="text-sm text-slate-500">No company selected.</div>;

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 tracking-tight">Knowledge Base & RAG Engine</h1>
          <p className="text-xs text-slate-400">Upload documents to power your AI agents&rsquo; pgvector-backed retrieval.</p>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.docx,.txt,.md,.markdown"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleUpload(file);
          }}
        />
        <Button
          variant="default"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="flex items-center gap-2 text-xs"
        >
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          Upload Document
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Card className="glass-panel border-white/[0.08] p-4">
          <div className="text-[10px] uppercase text-slate-500 tracking-wide">Documents</div>
          <div className="text-xl font-bold text-slate-100">{documents.length}</div>
        </Card>
        <Card className="glass-panel border-white/[0.08] p-4">
          <div className="text-[10px] uppercase text-slate-500 tracking-wide">Ready / Indexed</div>
          <div className="text-xl font-bold text-emerald-400">{readyCount}</div>
        </Card>
        <Card className="glass-panel border-white/[0.08] p-4">
          <div className="text-[10px] uppercase text-slate-500 tracking-wide">Total Chunks</div>
          <div className="text-xl font-bold text-sky-400">{totalChunks}</div>
        </Card>
      </div>

      <Card className="glass-panel border-white/[0.08] p-5 space-y-3">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
            <input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && runSearch()}
              placeholder="Search knowledge base…"
              className="w-full rounded-xl bg-slate-900/80 border border-white/[0.08] pl-9 pr-4 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500"
            />
          </div>
          <Button variant="outline" size="sm" onClick={runSearch} disabled={searching}>
            {searching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Search"}
          </Button>
        </div>
        {searchResults && (
          <div className="space-y-2">
            <div className="text-[11px] text-slate-500">
              {searchResults.length} result(s) — mode: <span className="font-mono">{searchMode}</span>
              {searchMode === "text" && " (semantic search requires OPENAI_API_KEY — Requires Live Infrastructure)"}
            </div>
            {searchResults.map((chunk) => (
              <div key={chunk.id} className="text-xs bg-slate-900/60 border border-white/[0.06] rounded-lg p-3 text-slate-300">
                {chunk.content.slice(0, 240)}
                {chunk.content.length > 240 ? "…" : ""}
              </div>
            ))}
          </div>
        )}
      </Card>

      {loading ? (
        <div className="text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin inline mr-2" />
          Loading documents…
        </div>
      ) : documents.length === 0 ? (
        <Card className="glass-panel border-white/[0.08] p-8 text-center text-sm text-slate-500">
          No documents uploaded yet. Upload a PDF, DOCX, TXT, or Markdown file to get started.
        </Card>
      ) : (
        <div className="space-y-2">
          {documents.map((doc) => (
            <Card key={doc.id} className="glass-panel border-white/[0.08] p-4 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <FileText className="h-5 w-5 text-slate-500 shrink-0" />
                <div className="min-w-0">
                  <div className="text-sm text-slate-100 font-medium truncate">{doc.title}</div>
                  <div className="text-[11px] text-slate-500 flex items-center gap-2">
                    <span>{doc.source_type}</span>
                    <span>•</span>
                    <span>{doc.chunk_count} chunks</span>
                    {doc.error_message && (
                      <span className="flex items-center gap-1 text-amber-400">
                        <AlertCircle className="h-3 w-3" />
                        {doc.error_message}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Badge variant={STATUS_VARIANT[doc.status]}>
                  {doc.status === "READY" && <CheckCircle2 className="h-3 w-3 mr-1 inline" />}
                  {doc.status}
                </Badge>
                <Button variant="ghost" size="sm" onClick={() => handleReindex(doc)} disabled={busyId === doc.id} aria-label={`Reindex ${doc.title}`}>
                  {busyId === doc.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => handleDelete(doc)} disabled={busyId === doc.id} aria-label={`Delete ${doc.title}`}>
                  <Trash2 className="h-3.5 w-3.5 text-rose-400" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
