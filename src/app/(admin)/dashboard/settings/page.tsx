"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Key, Globe, Save, Palette, Mic, CalendarClock, Loader2, Plus, Trash2, Copy, Upload } from "lucide-react";
import { Card } from "@/shared/ui/card";
import { useToast } from "@/shared/ui/toast";
import { Button } from "@/shared/ui/button";
import { Dialog } from "@/shared/ui/dialog";
import { useCompany } from "@/features/dashboard/context/CompanyContext";
import { apiFetch, ApiClientError } from "@/shared/lib/apiClient";
import { ApiKeyRecord, Branding, Company, Settings } from "@/core/domain/models/types";

export default function SettingsPage() {
  const { activeCompanyId, loading: companyLoading } = useCompany();
  const { showToast } = useToast();

  const [branding, setBranding] = useState<Branding | null>(null);
  const [apiKeys, setApiKeys] = useState<ApiKeyRecord[]>([]);
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState("");
  const [website, setWebsite] = useState("");
  const [primaryColor, setPrimaryColor] = useState("#0369a1");
  const [secondaryColor, setSecondaryColor] = useState("#0f172a");
  const [voiceModel, setVoiceModel] = useState("vapi-default");
  const [eventTypeId, setEventTypeId] = useState("");
  const [senderName, setSenderName] = useState("");

  const [newKeyDialogOpen, setNewKeyDialogOpen] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [createdRawKey, setCreatedRawKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!activeCompanyId) return;
    try {
      const [settingsData, keys] = await Promise.all([
        apiFetch<{ company: Company; branding: Branding | null; settings: Settings | null }>(`/api/admin/settings?companyId=${activeCompanyId}`),
        apiFetch<ApiKeyRecord[]>(`/api/admin/api-keys?companyId=${activeCompanyId}`),
      ]);
      setBranding(settingsData.branding);
      setApiKeys(keys);

      setName(settingsData.company.name);
      setWebsite(settingsData.company.website);
      setPrimaryColor(settingsData.branding?.primary_color ?? "#0369a1");
      setSecondaryColor(settingsData.branding?.secondary_color ?? "#0f172a");
      setVoiceModel((settingsData.settings?.voice_settings?.default_voice_model as string) ?? "vapi-default");
      setEventTypeId(String(settingsData.settings?.calendar_settings?.event_type_id ?? ""));
      setSenderName((settingsData.settings?.email_settings?.sender_name as string) ?? "");
    } catch (err) {
      showToast(err instanceof ApiClientError ? err.message : "Failed to load settings", "error");
    }
  }, [activeCompanyId, showToast]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSaveProfile = async () => {
    if (!activeCompanyId) return;
    setSaving(true);
    try {
      await apiFetch("/api/admin/settings", {
        method: "PUT",
        body: JSON.stringify({ company_id: activeCompanyId, name, website }),
      });
      showToast("Company profile saved", "success");
    } catch (err) {
      showToast(err instanceof ApiClientError ? err.message : "Failed to save profile", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveBranding = async () => {
    if (!activeCompanyId) return;
    setSaving(true);
    try {
      const updated = await apiFetch<Branding>("/api/admin/branding", {
        method: "PUT",
        body: JSON.stringify({ company_id: activeCompanyId, primary_color: primaryColor, secondary_color: secondaryColor }),
      });
      setBranding(updated);
      showToast("Branding saved", "success");
    } catch (err) {
      showToast(err instanceof ApiClientError ? err.message : "Failed to save branding", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleLogoUpload = async (file: File) => {
    if (!activeCompanyId) return;
    setUploadingLogo(true);
    try {
      const form = new FormData();
      form.append("companyId", activeCompanyId);
      form.append("file", file);
      const res = await fetch("/api/admin/branding/logo", { method: "POST", body: form });
      const json = await res.json();
      if (!res.ok || !json.success) throw new ApiClientError(res.status, json.message);
      setBranding(json.data.branding);
      showToast("Logo uploaded", "success");
    } catch (err) {
      showToast(err instanceof ApiClientError ? err.message : "Logo upload failed", "error");
    } finally {
      setUploadingLogo(false);
      if (logoInputRef.current) logoInputRef.current.value = "";
    }
  };

  const handleSaveVoiceAndCalendar = async () => {
    if (!activeCompanyId) return;
    setSaving(true);
    try {
      await apiFetch<Settings>("/api/admin/settings", {
        method: "PUT",
        body: JSON.stringify({
          company_id: activeCompanyId,
          voice_settings: { default_voice_model: voiceModel },
          calendar_settings: { event_type_id: eventTypeId ? Number(eventTypeId) : undefined },
          email_settings: { sender_name: senderName },
        }),
      });
      showToast("Configuration saved", "success");
    } catch (err) {
      showToast(err instanceof ApiClientError ? err.message : "Failed to save configuration", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleCreateApiKey = async () => {
    if (!activeCompanyId || newKeyName.trim().length < 2) {
      showToast("Give the key a name (2+ characters)", "error");
      return;
    }
    try {
      const created = await apiFetch<ApiKeyRecord & { rawKey: string }>("/api/admin/api-keys", {
        method: "POST",
        body: JSON.stringify({ company_id: activeCompanyId, name: newKeyName, scopes: [] }),
      });
      setApiKeys((prev) => [created, ...prev]);
      setCreatedRawKey(created.rawKey);
      setNewKeyName("");
    } catch (err) {
      showToast(err instanceof ApiClientError ? err.message : "Failed to create API key", "error");
    }
  };

  const handleRevokeKey = async (keyId: string) => {
    if (!activeCompanyId) return;
    try {
      await apiFetch(`/api/admin/api-keys/${keyId}?companyId=${activeCompanyId}`, { method: "DELETE" });
      setApiKeys((prev) => prev.map((k) => (k.id === keyId ? { ...k, revoked_at: new Date().toISOString() } : k)));
      showToast("API key revoked", "success");
    } catch (err) {
      showToast(err instanceof ApiClientError ? err.message : "Failed to revoke key", "error");
    }
  };

  if (companyLoading) return <div className="text-sm text-slate-500">Loading workspace…</div>;
  if (!activeCompanyId) return <div className="text-sm text-slate-500">No company selected.</div>;

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-slate-100 tracking-tight">Organization Settings</h1>
        <p className="text-xs text-slate-400">Configure tenant branding, voice defaults, calendar integration, and platform API keys.</p>
      </div>

      <Card className="glass-panel border-white/[0.08] p-6 space-y-4">
        <div className="flex items-center gap-2 text-slate-100 font-bold text-sm border-b border-white/[0.08] pb-3">
          <Globe className="h-4 w-4 text-sky-400" />
          Company Profile
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          <div>
            <label className="block font-medium text-slate-300 mb-1">Company Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} className="dashboard-input" />
          </div>
          <div>
            <label className="block font-medium text-slate-300 mb-1">Company Website</label>
            <input value={website} onChange={(e) => setWebsite(e.target.value)} className="dashboard-input" />
          </div>
        </div>
        <Button variant="default" size="sm" onClick={handleSaveProfile} disabled={saving} className="flex items-center gap-2">
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          Save Profile
        </Button>
      </Card>

      <Card className="glass-panel border-white/[0.08] p-6 space-y-4">
        <div className="flex items-center gap-2 text-slate-100 font-bold text-sm border-b border-white/[0.08] pb-3">
          <Palette className="h-4 w-4 text-fuchsia-400" />
          Branding
        </div>
        <div className="flex items-center gap-4">
          {branding?.logo_storage_path && (
            <div className="h-12 w-12 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-[10px] text-slate-500">
              Logo set
            </div>
          )}
          <input ref={logoInputRef} type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" className="hidden" onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleLogoUpload(file);
          }} />
          <Button variant="outline" size="sm" onClick={() => logoInputRef.current?.click()} disabled={uploadingLogo} className="flex items-center gap-2">
            {uploadingLogo ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
            Upload Logo
          </Button>
        </div>
        <div className="grid grid-cols-2 gap-4 text-xs">
          <div>
            <label className="block font-medium text-slate-300 mb-1">Primary Color</label>
            <div className="flex items-center gap-2">
              <input type="color" value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} className="h-8 w-10 rounded border border-white/10 bg-transparent" />
              <input value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} className="dashboard-input font-mono" />
            </div>
          </div>
          <div>
            <label className="block font-medium text-slate-300 mb-1">Secondary Color</label>
            <div className="flex items-center gap-2">
              <input type="color" value={secondaryColor} onChange={(e) => setSecondaryColor(e.target.value)} className="h-8 w-10 rounded border border-white/10 bg-transparent" />
              <input value={secondaryColor} onChange={(e) => setSecondaryColor(e.target.value)} className="dashboard-input font-mono" />
            </div>
          </div>
        </div>
        <Button variant="default" size="sm" onClick={handleSaveBranding} disabled={saving} className="flex items-center gap-2">
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          Save Branding
        </Button>
      </Card>

      <Card className="glass-panel border-white/[0.08] p-6 space-y-4">
        <div className="flex items-center gap-2 text-slate-100 font-bold text-sm border-b border-white/[0.08] pb-3">
          <Mic className="h-4 w-4 text-amber-400" />
          Voice, Calendar & Email Defaults
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
          <div>
            <label className="block font-medium text-slate-300 mb-1">Default Voice Model</label>
            <input value={voiceModel} onChange={(e) => setVoiceModel(e.target.value)} className="dashboard-input" />
          </div>
          <div>
            <label className="block font-medium text-slate-300 mb-1 flex items-center gap-1">
              <CalendarClock className="h-3 w-3" />
              Cal.com Event Type ID
            </label>
            <input value={eventTypeId} onChange={(e) => setEventTypeId(e.target.value)} className="dashboard-input" placeholder="12345" />
          </div>
          <div>
            <label className="block font-medium text-slate-300 mb-1">Email Sender Name</label>
            <input value={senderName} onChange={(e) => setSenderName(e.target.value)} className="dashboard-input" placeholder="Acme AI Voice" />
          </div>
        </div>
        <Button variant="default" size="sm" onClick={handleSaveVoiceAndCalendar} disabled={saving} className="flex items-center gap-2">
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          Save Configuration
        </Button>
      </Card>

      <Card className="glass-panel border-white/[0.08] p-6 space-y-4">
        <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
          <div className="flex items-center gap-2 text-slate-100 font-bold text-sm">
            <Key className="h-4 w-4 text-emerald-400" />
            Platform API Keys
          </div>
          <Button variant="outline" size="sm" onClick={() => setNewKeyDialogOpen(true)} className="flex items-center gap-1">
            <Plus className="h-3.5 w-3.5" />
            New Key
          </Button>
        </div>
        {apiKeys.length === 0 ? (
          <p className="text-xs text-slate-500">No API keys yet.</p>
        ) : (
          <div className="space-y-2">
            {apiKeys.map((key) => (
              <div key={key.id} className="flex items-center justify-between text-xs bg-slate-900/60 border border-white/[0.06] rounded-lg px-3 py-2">
                <div>
                  <div className="text-slate-200 font-medium">{key.name}</div>
                  <div className="text-slate-500 font-mono">{key.key_prefix}••••••••</div>
                </div>
                {key.revoked_at ? (
                  <span className="text-rose-400">Revoked</span>
                ) : (
                  <Button variant="ghost" size="sm" onClick={() => handleRevokeKey(key.id)} aria-label={`Revoke ${key.name}`}>
                    <Trash2 className="h-3.5 w-3.5 text-rose-400" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      <Dialog
        open={newKeyDialogOpen}
        onClose={() => {
          setNewKeyDialogOpen(false);
          setCreatedRawKey(null);
        }}
        title={createdRawKey ? "API Key Created" : "New API Key"}
        size="sm"
      >
        {createdRawKey ? (
          <div className="space-y-3">
            <p className="text-xs text-amber-400">Copy this key now — it will not be shown again.</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-xs bg-slate-900 border border-white/10 rounded-lg px-3 py-2 break-all">{createdRawKey}</code>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  navigator.clipboard.writeText(createdRawKey);
                  showToast("Copied to clipboard", "success");
                }}
                aria-label="Copy API key"
              >
                <Copy className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <label className="block text-xs">
              <span className="block text-[11px] uppercase tracking-wide text-slate-500 mb-1">Key name</span>
              <input value={newKeyName} onChange={(e) => setNewKeyName(e.target.value)} className="dashboard-input" placeholder="e.g. Zapier integration" />
            </label>
            <Button variant="default" size="sm" onClick={handleCreateApiKey}>
              Create Key
            </Button>
          </div>
        )}
      </Dialog>
    </div>
  );
}
