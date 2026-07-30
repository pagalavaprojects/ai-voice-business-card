"use client";

import React from "react";
import { Key, Globe, Save } from "lucide-react";
import { Card } from "@/shared/ui/card";
import { useToast } from "@/shared/ui/toast";
import { Button } from "@/shared/ui/button";

export default function SettingsPage() {
  const { showToast } = useToast();

  const handleSave = () => {
    // In production: PATCH /api/admin/settings
    showToast("Settings saved successfully.", "success");
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-slate-100 tracking-tight">Organization Settings & API Keys</h1>
        <p className="text-xs text-slate-400">Configure tenant branding, Vapi credentials, Cal.com API keys, and security parameters.</p>
      </div>

      <Card className="glass-panel border-white/[0.08] p-6 space-y-4">
        <div className="flex items-center gap-2 text-slate-100 font-bold text-sm border-b border-white/[0.08] pb-3">
          <Globe className="h-4 w-4 text-sky-400" />
          Company Profile & Branding
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          <div>
            <label className="block font-medium text-slate-300 mb-1">Company Name</label>
            <input
              type="text"
              defaultValue="Acme Autonomous Corp"
              className="w-full bg-slate-900 border border-white/10 rounded-xl px-3 py-2 text-slate-100 focus:outline-none focus:border-sky-500"
            />
          </div>
          <div>
            <label className="block font-medium text-slate-300 mb-1">Company Website</label>
            <input
              type="text"
              defaultValue="https://acme.ai"
              className="w-full bg-slate-900 border border-white/10 rounded-xl px-3 py-2 text-slate-100 focus:outline-none focus:border-sky-500"
            />
          </div>
        </div>
      </Card>

      <Card className="glass-panel border-white/[0.08] p-6 space-y-4">
        <div className="flex items-center gap-2 text-slate-100 font-bold text-sm border-b border-white/[0.08] pb-3">
          <Key className="h-4 w-4 text-emerald-400" />
          Third-Party SaaS API Integrations
        </div>

        <div className="space-y-3 text-xs">
          <div>
            <label className="block font-medium text-slate-300 mb-1">Vapi Voice Secret Key</label>
            <input
              type="password"
              defaultValue="vapi-sec-demo-12345"
              className="w-full bg-slate-900 border border-white/10 rounded-xl px-3 py-2 text-slate-100 font-mono focus:outline-none focus:border-sky-500"
            />
          </div>
          <div>
            <label className="block font-medium text-slate-300 mb-1">Cal.com REST API Key</label>
            <input
              type="password"
              defaultValue="cal_live_demo_67890"
              className="w-full bg-slate-900 border border-white/10 rounded-xl px-3 py-2 text-slate-100 font-mono focus:outline-none focus:border-sky-500"
            />
          </div>
          <div>
            <label className="block font-medium text-slate-300 mb-1">Resend Email API Key</label>
            <input
              type="password"
              defaultValue="re_demo_998877"
              className="w-full bg-slate-900 border border-white/10 rounded-xl px-3 py-2 text-slate-100 font-mono focus:outline-none focus:border-sky-500"
            />
          </div>
        </div>

        <div className="pt-2">
          <Button variant="default" onClick={handleSave} className="flex items-center gap-2 text-xs">
            <Save className="h-4 w-4" />
            Save Configuration
          </Button>
        </div>
      </Card>
    </div>
  );
}
