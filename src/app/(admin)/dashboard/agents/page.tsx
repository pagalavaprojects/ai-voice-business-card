"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Bot, Plus, Loader2, PlayCircle, CheckCircle2, XCircle } from "lucide-react";
import { Card } from "@/shared/ui/card";
import { Button } from "@/shared/ui/button";
import { Badge } from "@/shared/ui/badge";
import { Dialog } from "@/shared/ui/dialog";
import { useToast } from "@/shared/ui/toast";
import { useCompany } from "@/features/dashboard/context/CompanyContext";
import { apiFetch, ApiClientError } from "@/shared/lib/apiClient";
import { AIAgent, AgentDepartment } from "@/core/domain/agent/AIAgent";
import { KnowledgeDocument } from "@/core/domain/models/types";
import { KNOWN_TOOL_NAMES } from "@/core/application/tools/ToolRegistry";
import { SUPPORTED_LANGUAGES } from "@/features/language/config";

const DEPARTMENTS: AgentDepartment[] = ["SALES", "TECHNICAL_SUPPORT", "RECRUITER", "CUSTOMER_SUCCESS", "SUPERVISOR"];

// A starting set, not a closed list — welcome_message_language accepts any
// BCP-47-ish tag, so this exists only to save typing for the common cases.
// Adding a language the greeting is actually written in is a data change
// (this array + the script itself), never a code change.
const WELCOME_LANGUAGES: Array<{ code: string; label: string }> = [
  { code: "en", label: "English" },
  { code: "ta", label: "Tamil" },
  { code: "hi", label: "Hindi" },
];

interface AgentReadiness {
  ready: boolean;
  checks: Array<{ label: string; passed: boolean; detail: string }>;
}

export default function AgentsManagementPage() {
  const { activeCompanyId, loading: companyLoading } = useCompany();
  const { showToast } = useToast();

  const [agents, setAgents] = useState<AIAgent[]>([]);
  const [loading, setLoading] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [editAgent, setEditAgent] = useState<AIAgent | null>(null);
  const [knowledgeDocs, setKnowledgeDocs] = useState<KnowledgeDocument[]>([]);

  const fetchAgents = useCallback(async () => {
    if (!activeCompanyId) return;
    setLoading(true);
    try {
      const data = await apiFetch<{ agents: AIAgent[] }>(`/api/admin/agents?companyId=${activeCompanyId}`);
      setAgents(data.agents);
    } catch (err) {
      showToast(err instanceof ApiClientError ? err.message : "Failed to load agents", "error");
    } finally {
      setLoading(false);
    }
  }, [activeCompanyId, showToast]);

  useEffect(() => {
    fetchAgents();
  }, [fetchAgents]);

  useEffect(() => {
    if (!activeCompanyId) return;
    apiFetch<{ documents: KnowledgeDocument[] }>(`/api/admin/knowledge?companyId=${activeCompanyId}`)
      .then((data) => setKnowledgeDocs(data.documents))
      .catch(() => setKnowledgeDocs([]));
  }, [activeCompanyId]);

  if (companyLoading) return <div className="text-sm text-slate-500">Loading workspace…</div>;
  if (!activeCompanyId) return <div className="text-sm text-slate-500">No company selected.</div>;

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 tracking-tight">AI Employee Fleet Management</h1>
          <p className="text-xs text-slate-400">Configure and orchestrate multi-agent AI digital twins across departments.</p>
        </div>
        <Button variant="default" onClick={() => setCreateOpen(true)} className="flex items-center gap-2 text-xs">
          <Plus className="h-4 w-4" />
          Deploy New AI Agent
        </Button>
      </div>

      {loading ? (
        <div className="text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin inline mr-2" />
          Loading agents…
        </div>
      ) : agents.length === 0 ? (
        <Card className="glass-panel border-white/[0.08] p-8 text-center text-sm text-slate-500">
          No agents deployed yet. Deploy your first AI employee to get started.
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {agents.map((agent) => (
            <Card key={agent.id} className="glass-panel border-white/[0.08] p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="h-10 w-10 shrink-0 rounded-xl bg-gradient-to-tr from-sky-500 to-indigo-500 flex items-center justify-center text-white font-bold">
                    <Bot className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-bold text-sm text-slate-100 truncate">{agent.name}</h3>
                    <p className="text-[11px] text-sky-400 font-medium">{agent.department}</p>
                  </div>
                </div>
                <Badge variant={agent.status === "ACTIVE" ? "success" : agent.status === "TESTING" ? "warning" : "outline"}>
                  ● {agent.status}
                </Badge>
              </div>

              <div className="space-y-2 border-t border-white/[0.06] pt-3 text-xs">
                <div className="flex justify-between text-slate-400">
                  <span>Voice Model:</span>
                  <span className="font-mono text-slate-200">{agent.voice_model_id}</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Capabilities:</span>
                  <span className="font-mono text-slate-200">{agent.tools.length} Tools</span>
                </div>
              </div>

              <Button variant="glass" className="w-full text-xs" onClick={() => setEditAgent(agent)}>
                Configure Agent →
              </Button>
            </Card>
          ))}
        </div>
      )}

      <CreateAgentDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        companyId={activeCompanyId}
        onCreated={(agent) => {
          setAgents((prev) => [agent, ...prev]);
          setCreateOpen(false);
          showToast("Agent deployed in TESTING status", "success");
        }}
      />

      <EditAgentDialog
        agent={editAgent}
        onClose={() => setEditAgent(null)}
        companyId={activeCompanyId}
        knowledgeDocs={knowledgeDocs}
        onUpdated={(agent) => {
          setAgents((prev) => prev.map((a) => (a.id === agent.id ? agent : a)));
          setEditAgent(agent);
        }}
      />
    </div>
  );
}

function CreateAgentDialog({
  open,
  onClose,
  companyId,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  companyId: string;
  onCreated: (agent: AIAgent) => void;
}) {
  const { showToast } = useToast();
  const [name, setName] = useState("");
  const [department, setDepartment] = useState<AgentDepartment>("SALES");
  const [voiceModelId, setVoiceModelId] = useState("vapi-default");
  const [personalityPrompt, setPersonalityPrompt] = useState("");
  const [firstMessage, setFirstMessage] = useState("");
  const [welcomeLanguage, setWelcomeLanguage] = useState("en");
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setName("");
    setDepartment("SALES");
    setVoiceModelId("vapi-default");
    setPersonalityPrompt("");
    setFirstMessage("");
    setWelcomeLanguage("en");
  };

  const submit = async () => {
    if (name.trim().length < 2 || personalityPrompt.trim().length < 10) {
      showToast("Name and a personality prompt (10+ characters) are required", "error");
      return;
    }
    setSubmitting(true);
    try {
      const agent = await apiFetch<AIAgent>("/api/admin/agents", {
        method: "POST",
        body: JSON.stringify({
          company_id: companyId,
          department,
          name,
          voice_model_id: voiceModelId,
          personality_prompt: personalityPrompt,
          first_message: firstMessage.trim() || undefined,
          welcome_message_language: welcomeLanguage.trim() || undefined,
        }),
      });
      onCreated(agent);
      reset();
    } catch (err) {
      showToast(err instanceof ApiClientError ? err.message : "Failed to create agent", "error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} title="Deploy New AI Agent" description="New agents start in TESTING status.">
      <div className="space-y-4 text-sm">
        <Field label="Name">
          <input value={name} onChange={(e) => setName(e.target.value)} className="dashboard-input" placeholder="e.g. Sarah Connor" />
        </Field>
        <Field label="Department">
          <select value={department} onChange={(e) => setDepartment(e.target.value as AgentDepartment)} className="dashboard-input">
            {DEPARTMENTS.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Voice Model ID">
          <input value={voiceModelId} onChange={(e) => setVoiceModelId(e.target.value)} className="dashboard-input" />
        </Field>
        <Field label="Personality Prompt">
          <textarea
            value={personalityPrompt}
            onChange={(e) => setPersonalityPrompt(e.target.value)}
            rows={4}
            className="dashboard-input"
            placeholder="You are an expert sales representative…"
          />
        </Field>
        <Field label="First Message (spoken before the AI model runs)">
          <textarea
            value={firstMessage}
            onChange={(e) => setFirstMessage(e.target.value)}
            rows={6}
            className="dashboard-input"
            placeholder="Hi! I'm... Thank you for scanning my AI business card…"
          />
        </Field>
        <WelcomeLanguageField value={welcomeLanguage} onChange={setWelcomeLanguage} />
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="default" size="sm" onClick={submit} disabled={submitting}>
            {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Deploy Agent"}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

function EditAgentDialog({
  agent,
  onClose,
  companyId,
  knowledgeDocs,
  onUpdated,
}: {
  agent: AIAgent | null;
  onClose: () => void;
  companyId: string;
  knowledgeDocs: KnowledgeDocument[];
  onUpdated: (agent: AIAgent) => void;
}) {
  const { showToast } = useToast();
  const [tools, setTools] = useState<string[]>([]);
  const [assignedKnowledge, setAssignedKnowledge] = useState<string[]>([]);
  const [firstMessage, setFirstMessage] = useState("");
  const [welcomeLanguage, setWelcomeLanguage] = useState("en");
  const [greetings, setGreetings] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [readiness, setReadiness] = useState<AgentReadiness | null>(null);

  useEffect(() => {
    if (!agent) return;
    setTools(agent.tools || []);
    setFirstMessage(agent.first_message || "");
    setWelcomeLanguage(agent.welcome_message_language || "en");
    setGreetings(agent.greetings || {});
    setReadiness(null);
    apiFetch<{ knowledgeDocumentIds: string[] }>(`/api/admin/agents/${agent.id}?companyId=${companyId}`)
      .then((data) => setAssignedKnowledge(data.knowledgeDocumentIds))
      .catch(() => setAssignedKnowledge([]));
  }, [agent, companyId]);

  if (!agent) return null;

  const toggleTool = (name: string) => {
    setTools((prev) => (prev.includes(name) ? prev.filter((t) => t !== name) : [...prev, name]));
  };
  const toggleKnowledge = (id: string) => {
    setAssignedKnowledge((prev) => (prev.includes(id) ? prev.filter((k) => k !== id) : [...prev, id]));
  };

  const save = async () => {
    setSaving(true);
    try {
      const updated = await apiFetch<AIAgent>(`/api/admin/agents/${agent.id}`, {
        method: "PUT",
        body: JSON.stringify({
          company_id: companyId,
          tools,
          knowledge_document_ids: assignedKnowledge,
          first_message: firstMessage.trim() || null,
          welcome_message_language: welcomeLanguage.trim() || undefined,
          // Empty strings are dropped, not saved as blank overrides — an
          // admin who cleared a field means "use the platform default for
          // this language again," not "greet visitors with silence."
          greetings: Object.fromEntries(Object.entries(greetings).filter(([, text]) => text.trim().length > 0)),
        }),
      });
      onUpdated(updated);
      showToast("Agent configuration saved", "success");
    } catch (err) {
      showToast(err instanceof ApiClientError ? err.message : "Failed to save agent", "error");
    } finally {
      setSaving(false);
    }
  };

  const setStatus = async (status: AIAgent["status"]) => {
    try {
      const updated = await apiFetch<AIAgent>(`/api/admin/agents/${agent.id}`, {
        method: "PUT",
        body: JSON.stringify({ company_id: companyId, status }),
      });
      onUpdated(updated);
      showToast(`Agent status set to ${status}`, "success");
    } catch (err) {
      showToast(err instanceof ApiClientError ? err.message : "Failed to update status", "error");
    }
  };

  const runTest = async () => {
    setTesting(true);
    try {
      const result = await apiFetch<AgentReadiness>(`/api/admin/agents/${agent.id}/test`, {
        method: "POST",
        body: JSON.stringify({ company_id: companyId }),
      });
      setReadiness(result);
    } catch (err) {
      showToast(err instanceof ApiClientError ? err.message : "Readiness check failed", "error");
    } finally {
      setTesting(false);
    }
  };

  return (
    <Dialog open={!!agent} onClose={onClose} title={`Configure ${agent.name}`} size="lg">
      <div className="space-y-5 text-sm">
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500">Status:</span>
          {(["TESTING", "ACTIVE", "INACTIVE"] as const).map((s) => (
            <Button key={s} size="sm" variant={agent.status === s ? "default" : "outline"} onClick={() => setStatus(s)}>
              {s}
            </Button>
          ))}
        </div>

        <Field label="First Message (spoken before the AI model runs)">
          <textarea
            value={firstMessage}
            onChange={(e) => setFirstMessage(e.target.value)}
            rows={6}
            className="dashboard-input"
            placeholder="Hi! I'm... Thank you for scanning my AI business card…"
          />
        </Field>
        <WelcomeLanguageField value={welcomeLanguage} onChange={setWelcomeLanguage} />

        <MultilingualGreetingsField greetings={greetings} onChange={setGreetings} />

        <div>
          <div className="text-slate-500 uppercase tracking-wide text-[10px] mb-2">Tool Assignment</div>
          <div className="grid grid-cols-2 gap-2">
            {KNOWN_TOOL_NAMES.map((name) => (
              <label key={name} className="flex items-center gap-2 text-xs text-slate-300">
                <input type="checkbox" checked={tools.includes(name)} onChange={() => toggleTool(name)} />
                {name}
              </label>
            ))}
          </div>
        </div>

        <div>
          <div className="text-slate-500 uppercase tracking-wide text-[10px] mb-2">Knowledge Assignment</div>
          {knowledgeDocs.length === 0 ? (
            <p className="text-xs text-slate-500">No knowledge documents uploaded yet.</p>
          ) : (
            <div className="space-y-1.5 max-h-32 overflow-y-auto">
              {knowledgeDocs.map((doc) => (
                <label key={doc.id} className="flex items-center gap-2 text-xs text-slate-300">
                  <input type="checkbox" checked={assignedKnowledge.includes(doc.id)} onChange={() => toggleKnowledge(doc.id)} />
                  {doc.title}
                  <span className="text-slate-600">({doc.status})</span>
                </label>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 pt-2 border-t border-white/[0.06]">
          <Button variant="outline" size="sm" onClick={runTest} disabled={testing} className="flex items-center gap-2">
            {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PlayCircle className="h-3.5 w-3.5" />}
            Run Readiness Test
          </Button>
          <Button variant="default" size="sm" onClick={save} disabled={saving}>
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Save Configuration"}
          </Button>
        </div>

        {readiness && (
          <div className="space-y-1.5 text-xs border-t border-white/[0.06] pt-3">
            {readiness.checks.map((check) => (
              <div key={check.label} className="flex items-start gap-2">
                {check.passed ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0 mt-0.5" />
                ) : (
                  <XCircle className="h-3.5 w-3.5 text-amber-400 shrink-0 mt-0.5" />
                )}
                <div>
                  <div className="text-slate-200">{check.label}</div>
                  <div className="text-slate-500">{check.detail}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[11px] uppercase tracking-wide text-slate-500 mb-1">{label}</span>
      {children}
    </label>
  );
}

/** What language the first-message textarea above it is written in. A
 * preset list for the common cases plus free text for anything else — the
 * validation (a loose BCP-47-ish tag) accepts any of them, so a language not
 * in WELCOME_LANGUAGES yet is still just typing, not a code change. */
function WelcomeLanguageField({ value, onChange }: { value: string; onChange: (code: string) => void }) {
  const isPreset = WELCOME_LANGUAGES.some((l) => l.code === value);
  return (
    <Field label="Greeting language">
      <div className="flex items-center gap-2">
        <select
          value={isPreset ? value : "other"}
          onChange={(e) => onChange(e.target.value === "other" ? "" : e.target.value)}
          className="dashboard-input"
        >
          {WELCOME_LANGUAGES.map((l) => (
            <option key={l.code} value={l.code}>
              {l.label}
            </option>
          ))}
          <option value="other">Other…</option>
        </select>
        {!isPreset && (
          <input
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="e.g. te"
            aria-label="Custom language tag"
            className="dashboard-input w-24"
          />
        )}
      </div>
    </Field>
  );
}

/** Per-language greeting overrides for the multilingual voice card — one of
 * these, or none, per supported language. A blank field means "no override
 * for this language," not "greet visitors with silence": the platform's
 * own generic per-language template (features/language/greetings.ts) is
 * what plays instead, so leaving every field blank is a fully valid,
 * zero-setup state, not a broken one. */
function MultilingualGreetingsField({
  greetings,
  onChange,
}: {
  greetings: Record<string, string>;
  onChange: (next: Record<string, string>) => void;
}) {
  return (
    <div>
      <div className="text-slate-500 uppercase tracking-wide text-[10px] mb-2">
        Multilingual greetings (optional — blank uses the platform default for that language)
      </div>
      <div className="space-y-3">
        {SUPPORTED_LANGUAGES.map((lang) => (
          <Field key={lang.code} label={`${lang.name} (${lang.nativeName})`}>
            <textarea
              value={greetings[lang.code] ?? ""}
              onChange={(e) => onChange({ ...greetings, [lang.code]: e.target.value })}
              rows={3}
              className="dashboard-input"
              placeholder={`Greeting spoken to visitors who choose ${lang.name}…`}
            />
          </Field>
        ))}
      </div>
    </div>
  );
}
