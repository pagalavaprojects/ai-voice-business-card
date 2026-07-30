"use client";

import React from "react";
import { Bot, Plus } from "lucide-react";
import { Card } from "@/shared/ui/card";
import { Button } from "@/shared/ui/button";
import { Badge } from "@/shared/ui/badge";
import { useToast } from "@/shared/ui/toast";

const dummyAgents = [
  {
    id: "agent-1",
    name: "Sarah Connor",
    department: "SALES",
    voice: "vapi-sales-female",
    capabilities: ["search_products", "save_lead", "book_appointment"],
    status: "ACTIVE",
  },
  {
    id: "agent-2",
    name: "Alex Vance",
    department: "TECHNICAL_SUPPORT",
    voice: "vapi-tech-male",
    capabilities: ["search_faqs", "get_company_information"],
    status: "ACTIVE",
  },
  {
    id: "agent-3",
    name: "Elena Rostova",
    department: "RECRUITER",
    voice: "vapi-hr-female",
    capabilities: ["save_lead"],
    status: "ACTIVE",
  },
];

export default function AgentsManagementPage() {
  const { showToast } = useToast();

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 tracking-tight">AI Employee Fleet Management</h1>
          <p className="text-xs text-slate-400">Configure and orchestrate multi-agent AI digital twins across departments.</p>
        </div>
        <Button variant="default" onClick={() => showToast("Agent deployment wizard coming soon.", "info")} className="flex items-center gap-2 text-xs">
          <Plus className="h-4 w-4" />
          Deploy New AI Agent
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {dummyAgents.map((agent) => (
          <Card key={agent.id} className="glass-panel border-white/[0.08] p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-sky-500 to-indigo-500 flex items-center justify-center text-white font-bold">
                  <Bot className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-slate-100">{agent.name}</h3>
                  <p className="text-[11px] text-sky-400 font-medium">{agent.department}</p>
                </div>
              </div>
              <Badge variant="success">● {agent.status}</Badge>
            </div>

            <div className="space-y-2 border-t border-white/[0.06] pt-3 text-xs">
              <div className="flex justify-between text-slate-400">
                <span>Voice Model:</span>
                <span className="font-mono text-slate-200">{agent.voice}</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Capabilities:</span>
                <span className="font-mono text-slate-200">{agent.capabilities.length} Tools</span>
              </div>
            </div>

            <Button variant="glass" className="w-full text-xs">
              Configure Agent Prompt →
            </Button>
          </Card>
        ))}
      </div>
    </div>
  );
}
