"use client";

import React, { useState } from "react";
import { FileCode, Save, RefreshCw } from "lucide-react";
import { Card } from "@/shared/ui/card";
import { Button } from "@/shared/ui/button";
import { Badge } from "@/shared/ui/badge";
import { useToast } from "@/shared/ui/toast";

const PROMPT_MODULES = [
  { name: "identity", label: "Identity & Persona", description: "Defines the AI digital twin name, role, and personality." },
  { name: "behavior", label: "Behavior & Tone", description: "Controls how the AI responds: formal, casual, empathetic, direct." },
  { name: "sales", label: "Sales Engine", description: "Qualification questions, objection handling, and deal progression logic." },
  { name: "booking", label: "Booking & Calendar", description: "Meeting scheduling workflow, confirmation messaging, and rescheduling." },
  { name: "security", label: "Security Guardrails", description: "Prompt injection protection and off-topic deflection instructions." },
  { name: "fallback", label: "Fallback Handling", description: "Response strategy for unknown questions and edge cases." },
];

const DEFAULT_CONTENT = `You are {employee_name}, {designation} at {company_name}.

Your personality is professional, warm, and knowledgeable.

Company Overview:
{company_overview}

Key responsibilities:
- Represent the company professionally
- Answer visitor questions accurately
- Qualify leads and book meetings when appropriate

Always remain helpful and on-topic.`;

export default function PromptEditorPage() {
  const { showToast } = useToast();
  const [selectedModule, setSelectedModule] = useState("identity");
  const [content, setContent] = useState(DEFAULT_CONTENT);

  const handleSave = () => {
    // In production this would call: POST /api/admin/prompts
    showToast(`Prompt module "${selectedModule}" saved successfully.`, "success");
  };

  const handleReset = () => {
    setContent(DEFAULT_CONTENT);
    showToast("Prompt reset to default template.", "info");
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 tracking-tight">Prompt Template Editor</h1>
          <p className="text-xs text-slate-400">Edit modular AI prompt templates that drive each AI digital twin conversation engine.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="glass" onClick={handleReset} className="flex items-center gap-2 text-xs">
            <RefreshCw className="h-4 w-4" />
            Reset
          </Button>
          <Button variant="default" onClick={handleSave} className="flex items-center gap-2 text-xs">
            <Save className="h-4 w-4" />
            Save Changes
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        {/* Module Selector */}
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
        </Card>

        {/* Template Editor */}
        <div className="lg:col-span-3 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Badge variant="default">{PROMPT_MODULES.find((m) => m.name === selectedModule)?.label}</Badge>
              <Badge variant="outline">v1</Badge>
            </div>
            <p className="text-xs text-slate-500">
              Variables:{" "}
              <code className="text-sky-400">{"{employee_name}"}</code>,{" "}
              <code className="text-sky-400">{"{company_name}"}</code>,{" "}
              <code className="text-sky-400">{"{company_overview}"}</code>
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
    </div>
  );
}
