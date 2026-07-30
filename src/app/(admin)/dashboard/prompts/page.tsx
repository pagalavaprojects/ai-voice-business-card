"use client";

import React, { useCallback, useEffect, useState } from "react";
import { FileCode, Save, RefreshCw, Eye, History, Loader2 } from "lucide-react";
import { Card } from "@/shared/ui/card";
import { Button } from "@/shared/ui/button";
import { Badge } from "@/shared/ui/badge";
import { Dialog } from "@/shared/ui/dialog";
import { useToast } from "@/shared/ui/toast";
import { useCompany } from "@/features/dashboard/context/CompanyContext";
import { apiFetch, ApiClientError } from "@/shared/lib/apiClient";
import { Employee, PromptTemplate, PromptTemplateVersion } from "@/core/domain/models/types";
import { PROMPT_TEMPLATE_VARIABLES } from "@/core/application/services/PromptAssemblyService";
import { PromptDiff } from "@/features/dashboard/components/PromptDiff";

const PROMPT_MODULES: Array<{ name: PromptTemplate["module_name"]; label: string; description: string }> = [
  { name: "identity", label: "Identity & Persona", description: "Defines the AI digital twin name, role, and personality." },
  { name: "behavior", label: "Behavior & Tone", description: "Controls how the AI responds: formal, casual, empathetic, direct." },
  { name: "sales", label: "Sales Engine", description: "Qualification questions, objection handling, and deal progression logic." },
  { name: "booking", label: "Booking & Calendar", description: "Meeting scheduling workflow, confirmation messaging, and rescheduling." },
  { name: "security", label: "Security Guardrails", description: "Prompt injection protection and off-topic deflection instructions." },
  { name: "fallback", label: "Fallback Handling", description: "Response strategy for unknown questions and edge cases." },
];

export default function PromptEditorPage() {
  const { activeCompanyId, loading: companyLoading } = useCompany();
  const { showToast } = useToast();

  const [templates, setTemplates] = useState<PromptTemplate[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>("");
  const [selectedModule, setSelectedModule] = useState<PromptTemplate["module_name"]>("identity");
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);

  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewText, setPreviewText] = useState("");
  const [previewLoading, setPreviewLoading] = useState(false);

  const [historyOpen, setHistoryOpen] = useState(false);
  const [versions, setVersions] = useState<PromptTemplateVersion[]>([]);
  const [diffAgainst, setDiffAgainst] = useState<PromptTemplateVersion | null>(null);

  const currentTemplate = templates.find((t) => t.module_name === selectedModule) || null;

  const loadData = useCallback(async () => {
    if (!activeCompanyId) return;
    try {
      const [templateData, employeeData] = await Promise.all([
        apiFetch<PromptTemplate[]>(`/api/admin/prompts?companyId=${activeCompanyId}`),
        apiFetch<Employee[]>(`/api/admin/employees?companyId=${activeCompanyId}`),
      ]);
      setTemplates(templateData);
      setEmployees(employeeData);
      if (employeeData.length > 0 && !selectedEmployeeId) setSelectedEmployeeId(employeeData[0].id);
    } catch (err) {
      showToast(err instanceof ApiClientError ? err.message : "Failed to load prompt data", "error");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCompanyId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    const template = templates.find((t) => t.module_name === selectedModule);
    setContent(template?.template_content ?? "");
  }, [selectedModule, templates]);

  const handleSave = async () => {
    if (!activeCompanyId) return;
    setSaving(true);
    try {
      const updated = await apiFetch<PromptTemplate>("/api/admin/prompts", {
        method: "PUT",
        body: JSON.stringify({ company_id: activeCompanyId, module_name: selectedModule, content }),
      });
      setTemplates((prev) => {
        const others = prev.filter((t) => t.module_name !== selectedModule);
        return [...others, updated];
      });
      showToast(`Prompt module "${selectedModule}" saved (v${updated.version}).`, "success");
    } catch (err) {
      showToast(err instanceof ApiClientError ? err.message : "Failed to save prompt", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setContent(currentTemplate?.template_content ?? "");
    showToast("Reverted unsaved changes.", "info");
  };

  const handlePreview = async () => {
    if (!activeCompanyId || !selectedEmployeeId) {
      showToast("Select an employee to preview against first.", "error");
      return;
    }
    setPreviewOpen(true);
    setPreviewLoading(true);
    try {
      const data = await apiFetch<{ prompt: string }>("/api/admin/prompts/preview", {
        method: "POST",
        body: JSON.stringify({
          company_id: activeCompanyId,
          employee_id: selectedEmployeeId,
          module_name: selectedModule,
          draft_content: content,
        }),
      });
      setPreviewText(data.prompt);
    } catch (err) {
      showToast(err instanceof ApiClientError ? err.message : "Preview failed", "error");
      setPreviewOpen(false);
    } finally {
      setPreviewLoading(false);
    }
  };

  const openHistory = async () => {
    if (!currentTemplate || !activeCompanyId) {
      showToast("Save this module at least once before viewing history.", "info");
      return;
    }
    setHistoryOpen(true);
    setDiffAgainst(null);
    try {
      const data = await apiFetch<{ versions: PromptTemplateVersion[] }>(
        `/api/admin/prompts/${currentTemplate.id}/versions?companyId=${activeCompanyId}`
      );
      setVersions(data.versions);
    } catch (err) {
      showToast(err instanceof ApiClientError ? err.message : "Failed to load version history", "error");
    }
  };

  const handleRollback = async (version: number) => {
    if (!currentTemplate || !activeCompanyId) return;
    try {
      const updated = await apiFetch<PromptTemplate>(`/api/admin/prompts/${currentTemplate.id}/rollback`, {
        method: "POST",
        body: JSON.stringify({ company_id: activeCompanyId, version }),
      });
      setTemplates((prev) => [...prev.filter((t) => t.module_name !== selectedModule), updated]);
      setContent(updated.template_content);
      setHistoryOpen(false);
      showToast(`Rolled back to version ${version} (now v${updated.version}).`, "success");
    } catch (err) {
      showToast(err instanceof ApiClientError ? err.message : "Rollback failed", "error");
    }
  };

  if (companyLoading) return <div className="text-sm text-slate-500">Loading workspace…</div>;
  if (!activeCompanyId) return <div className="text-sm text-slate-500">No company selected.</div>;

  const isDirty = content !== (currentTemplate?.template_content ?? "");

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 tracking-tight">Prompt Template Editor</h1>
          <p className="text-xs text-slate-400">Edit modular AI prompt templates that drive each AI digital twin conversation engine.</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="glass" onClick={openHistory} className="flex items-center gap-2 text-xs">
            <History className="h-4 w-4" />
            History
          </Button>
          <Button variant="glass" onClick={handlePreview} className="flex items-center gap-2 text-xs">
            <Eye className="h-4 w-4" />
            Preview
          </Button>
          <Button variant="glass" onClick={handleReset} disabled={!isDirty} className="flex items-center gap-2 text-xs">
            <RefreshCw className="h-4 w-4" />
            Reset
          </Button>
          <Button variant="default" onClick={handleSave} disabled={saving || !isDirty} className="flex items-center gap-2 text-xs">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save Changes
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <Card className="glass-panel border-white/[0.08] p-4 space-y-2 h-fit">
          <p className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold pb-2 border-b border-white/[0.08]">Prompt Modules</p>
          {PROMPT_MODULES.map((mod) => (
            <button
              key={mod.name}
              onClick={() => setSelectedModule(mod.name)}
              className={`w-full text-left p-3 rounded-xl text-xs font-semibold transition-all ${
                selectedModule === mod.name
                  ? "bg-sky-500/10 text-sky-400 border border-sky-500/20"
                  : "text-slate-400 hover:text-slate-100 hover:bg-white/[0.04]"
              }`}
            >
              <div className="flex items-center gap-2">
                <FileCode className="h-3.5 w-3.5" />
                {mod.label}
              </div>
              <p className="text-[10px] text-slate-500 mt-1 font-normal leading-relaxed">{mod.description}</p>
            </button>
          ))}

          {employees.length > 0 && (
            <div className="pt-3 border-t border-white/[0.08]">
              <label className="block text-[10px] uppercase tracking-wide text-slate-500 mb-1" htmlFor="preview-employee">
                Preview as
              </label>
              <select
                id="preview-employee"
                value={selectedEmployeeId}
                onChange={(e) => setSelectedEmployeeId(e.target.value)}
                className="dashboard-input"
              >
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </Card>

        <div className="lg:col-span-3 space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Badge variant="default">{PROMPT_MODULES.find((m) => m.name === selectedModule)?.label}</Badge>
              <Badge variant="outline">v{currentTemplate?.version ?? "—"}</Badge>
              {isDirty && <Badge variant="warning">Unsaved changes</Badge>}
            </div>
            <p className="text-xs text-slate-500">
              Variables:{" "}
              {PROMPT_TEMPLATE_VARIABLES.map((v, i) => (
                <React.Fragment key={v}>
                  <code className="text-sky-400">{`{{${v}}}`}</code>
                  {i < PROMPT_TEMPLATE_VARIABLES.length - 1 && ", "}
                </React.Fragment>
              ))}
            </p>
          </div>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={20}
            aria-label={`Prompt template content for ${selectedModule} module`}
            className="w-full bg-slate-900 border border-white/[0.08] rounded-2xl p-5 text-xs text-slate-200 font-mono leading-relaxed focus:outline-none focus:border-sky-500 resize-y"
          />
        </div>
      </div>

      <Dialog open={previewOpen} onClose={() => setPreviewOpen(false)} title="Full Assembled Prompt Preview" size="lg">
        {previewLoading ? (
          <div className="text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin inline mr-2" />
            Assembling…
          </div>
        ) : (
          <pre className="whitespace-pre-wrap text-xs text-slate-300 bg-slate-900/60 border border-white/[0.06] rounded-lg p-4 max-h-[60vh] overflow-y-auto">
            {previewText}
          </pre>
        )}
      </Dialog>

      <Dialog open={historyOpen} onClose={() => setHistoryOpen(false)} title="Version History" size="lg">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <p className="text-[11px] uppercase tracking-wide text-slate-500">Versions</p>
            <button
              className={`w-full text-left p-2 rounded-lg text-xs ${!diffAgainst ? "bg-sky-500/10 text-sky-400" : "text-slate-400 hover:bg-white/[0.04]"}`}
              onClick={() => setDiffAgainst(null)}
            >
              Current (v{currentTemplate?.version})
            </button>
            {versions.map((v) => (
              <div key={v.id} className="flex items-center gap-1">
                <button
                  className={`flex-1 text-left p-2 rounded-lg text-xs ${diffAgainst?.id === v.id ? "bg-sky-500/10 text-sky-400" : "text-slate-400 hover:bg-white/[0.04]"}`}
                  onClick={() => setDiffAgainst(v)}
                >
                  v{v.version} — {new Date(v.created_at).toLocaleString()}
                </button>
                <Button variant="ghost" size="sm" onClick={() => handleRollback(v.version)}>
                  Rollback
                </Button>
              </div>
            ))}
            {versions.length === 0 && <p className="text-xs text-slate-500">No prior versions yet.</p>}
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wide text-slate-500 mb-2">
              {diffAgainst ? `Diff: v${diffAgainst.version} → current (v${currentTemplate?.version})` : "Select a version to diff against current"}
            </p>
            {diffAgainst ? (
              <PromptDiff before={diffAgainst.content} after={currentTemplate?.template_content ?? ""} />
            ) : (
              <pre className="whitespace-pre-wrap text-xs text-slate-300 bg-slate-900/60 border border-white/[0.06] rounded-lg p-3 max-h-[50vh] overflow-y-auto">
                {currentTemplate?.template_content}
              </pre>
            )}
          </div>
        </div>
      </Dialog>
    </div>
  );
}
