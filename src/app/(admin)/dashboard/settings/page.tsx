"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Key, Globe, Save, Palette, Mic, CalendarClock, Loader2, Plus, Trash2, Copy, Upload, UserPlus, Users, Languages } from "lucide-react";
import { Card } from "@/shared/ui/card";
import { useToast } from "@/shared/ui/toast";
import { Button } from "@/shared/ui/button";
import { Dialog } from "@/shared/ui/dialog";
import { useCompany } from "@/features/dashboard/context/CompanyContext";
import { apiFetch, ApiClientError } from "@/shared/lib/apiClient";
import { ApiKeyRecord, Branding, Company, CompanyMember, Settings, SUPPORTED_VOICE_IDS, UserProfile } from "@/core/domain/models/types";
import { makePublicUrlResolver } from "@/features/dashboard/components/catalog/CatalogFormPrimitives";
import { SUPPORTED_LANGUAGES, LanguageCode, isSupportedLanguage } from "@/features/language/config";

type MemberRole = CompanyMember["role"];
type MemberRow = CompanyMember & { user: UserProfile | null };

const ROLES: MemberRole[] = ["OWNER", "ADMIN", "MANAGER", "EMPLOYEE", "VIEWER"];

const logoUrlOf = makePublicUrlResolver("company-logos");

/** Two things the card actually renders, so an invalid value is visible to
 * every visitor rather than to the admin who typed it. */
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
function isHttpUrl(value: string): boolean {
  try {
    return ["http:", "https:"].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

/** Label + control pair. Written as a wrapping <label> so the association
 * cannot drift: the previous markup used a sibling <label> with no `htmlFor`,
 * which left every control on this page without an accessible name. */
function SettingField({
  label,
  hint,
  error,
  children,
}: {
  label: React.ReactNode;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block text-xs">
      <span className="block font-medium text-slate-300 mb-1">
        {label}
        {hint && <span className="ml-2 font-normal text-slate-500">{hint}</span>}
      </span>
      {children}
      {error && (
        <span role="alert" className="block text-[11px] text-rose-300 mt-1">
          {error}
        </span>
      )}
    </label>
  );
}

export default function SettingsPage() {
  const { activeCompanyId, loading: companyLoading } = useCompany();
  const { showToast } = useToast();

  const [branding, setBranding] = useState<Branding | null>(null);
  const [apiKeys, setApiKeys] = useState<ApiKeyRecord[]>([]);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState("");
  const [website, setWebsite] = useState("");
  const [primaryColor, setPrimaryColor] = useState("#0369a1");
  const [secondaryColor, setSecondaryColor] = useState("#0f172a");
  const [voiceModel, setVoiceModel] = useState("");
  const [eventTypeId, setEventTypeId] = useState("");
  const [bookingUrl, setBookingUrl] = useState("");
  const [senderName, setSenderName] = useState("");
  // Empty string means "no company override" (inherit the platform default,
  // Tamil) — matches the same empty-means-inherit shape as voiceModel above.
  const [defaultLanguage, setDefaultLanguage] = useState<LanguageCode | "">("");
  // Empty array means "no restriction, every platform language is offered" —
  // the same inherit-all-unless-narrowed shape resolveEnabledLanguageList
  // uses server-side, not "no languages available."
  const [enabledLanguages, setEnabledLanguages] = useState<LanguageCode[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [newKeyDialogOpen, setNewKeyDialogOpen] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [createdRawKey, setCreatedRawKey] = useState<string | null>(null);

  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<MemberRole>("EMPLOYEE");
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!activeCompanyId) return;
    try {
      const [settingsData, keys, memberList] = await Promise.all([
        apiFetch<{ company: Company; branding: Branding | null; settings: Settings | null }>(`/api/admin/settings?companyId=${activeCompanyId}`),
        apiFetch<ApiKeyRecord[]>(`/api/admin/api-keys?companyId=${activeCompanyId}`),
        apiFetch<MemberRow[]>(`/api/admin/members?companyId=${activeCompanyId}`),
      ]);
      setBranding(settingsData.branding);
      setApiKeys(keys);
      setMembers(memberList);

      setName(settingsData.company.name);
      setWebsite(settingsData.company.website);
      setPrimaryColor(settingsData.branding?.primary_color ?? "#0369a1");
      setSecondaryColor(settingsData.branding?.secondary_color ?? "#0f172a");
      setVoiceModel((settingsData.settings?.voice_settings?.default_voice_model as string) ?? "");
      setEventTypeId(String(settingsData.settings?.calendar_settings?.event_type_id ?? ""));
      setBookingUrl((settingsData.settings?.calendar_settings?.booking_url as string) ?? "");
      setSenderName((settingsData.settings?.email_settings?.sender_name as string) ?? "");

      const langSettings = settingsData.settings?.language_settings;
      const storedDefault = langSettings?.default_language;
      setDefaultLanguage(typeof storedDefault === "string" && isSupportedLanguage(storedDefault) ? storedDefault : "");
      const storedEnabled = langSettings?.enabled_languages;
      setEnabledLanguages(Array.isArray(storedEnabled) ? storedEnabled.filter((v): v is LanguageCode => typeof v === "string" && isSupportedLanguage(v)) : []);
    } catch (err) {
      showToast(err instanceof ApiClientError ? err.message : "Failed to load settings", "error");
    }
  }, [activeCompanyId, showToast]);

  useEffect(() => {
    load();
  }, [load]);

  const setError = (key: string, message: string | null) =>
    setErrors((prev) => {
      const next = { ...prev };
      if (message) next[key] = message;
      else delete next[key];
      return next;
    });

  const handleSaveProfile = async () => {
    if (!activeCompanyId) return;
    // The API requires a valid URL; catching it here means the admin sees which
    // field is wrong instead of a generic 422 toast.
    if (name.trim().length < 2) return setError("name", "Company name must be at least 2 characters");
    if (!isHttpUrl(website.trim())) return setError("website", "Enter a full URL, including https://");
    setErrors({});
    setSaving(true);
    try {
      await apiFetch("/api/admin/settings", {
        method: "PUT",
        body: JSON.stringify({ company_id: activeCompanyId, name: name.trim(), website: website.trim() }),
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
    // These two colors are painted onto the public card, so a malformed value
    // is visible to every visitor rather than to the admin who typed it.
    if (!HEX_COLOR.test(primaryColor)) return setError("primaryColor", "Use a 6-digit hex colour, e.g. #0369a1");
    if (!HEX_COLOR.test(secondaryColor)) return setError("secondaryColor", "Use a 6-digit hex colour, e.g. #0f172a");
    setErrors({});
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
    if (eventTypeId.trim() && !(Number(eventTypeId) > 0)) {
      return setError("eventTypeId", "Cal.com event type IDs are positive numbers");
    }
    if (bookingUrl.trim() && !isHttpUrl(bookingUrl.trim())) {
      return setError("bookingUrl", "Enter a full URL, including https://");
    }
    setErrors({});
    setSaving(true);
    try {
      await apiFetch<Settings>("/api/admin/settings", {
        method: "PUT",
        body: JSON.stringify({
          company_id: activeCompanyId,
          // Empty means "no company default", which is what the resolution
          // chain treats as inherit — not an empty string it would have to
          // special-case.
          voice_settings: { default_voice_model: voiceModel || null },
          calendar_settings: {
            event_type_id: eventTypeId.trim() ? Number(eventTypeId) : null,
            booking_url: bookingUrl.trim() || null,
          },
          email_settings: { sender_name: senderName.trim() || null },
        }),
      });
      showToast("Configuration saved", "success");
    } catch (err) {
      showToast(err instanceof ApiClientError ? err.message : "Failed to save configuration", "error");
    } finally {
      setSaving(false);
    }
  };

  const toggleEnabledLanguage = (code: LanguageCode) => {
    setEnabledLanguages((prev) => (prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]));
  };

  const handleSaveLanguageSettings = async () => {
    if (!activeCompanyId) return;
    // A default that isn't in the enabled set would leave the platform
    // resolving to a language visitors can never actually reach — caught
    // here rather than surfacing as a confusing runtime fallback later.
    if (defaultLanguage && enabledLanguages.length > 0 && !enabledLanguages.includes(defaultLanguage)) {
      return setError("defaultLanguage", "The default language must also be one of the enabled languages");
    }
    setErrors({});
    setSaving(true);
    try {
      await apiFetch<Settings>("/api/admin/settings", {
        method: "PUT",
        body: JSON.stringify({
          company_id: activeCompanyId,
          language_settings: {
            default_language: defaultLanguage || null,
            enabled_languages: enabledLanguages,
          },
        }),
      });
      showToast("Language settings saved", "success");
    } catch (err) {
      showToast(err instanceof ApiClientError ? err.message : "Failed to save language settings", "error");
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

  const handleInviteMember = async () => {
    if (!activeCompanyId) return;
    setInviting(true);
    setInviteError(null);
    try {
      await apiFetch<CompanyMember>("/api/admin/members", {
        method: "POST",
        body: JSON.stringify({ company_id: activeCompanyId, email: inviteEmail.trim(), role: inviteRole }),
      });
      showToast("Member invited", "success");
      setInviteOpen(false);
      setInviteEmail("");
      // Refetch rather than appending: the response carries no joined user
      // profile, so an optimistic row would render without a name or email.
      setMembers(await apiFetch<MemberRow[]>(`/api/admin/members?companyId=${activeCompanyId}`));
    } catch (err) {
      setInviteError(err instanceof ApiClientError ? err.message : "Failed to invite member");
    } finally {
      setInviting(false);
    }
  };

  const handleChangeRole = async (memberId: string, role: MemberRole) => {
    if (!activeCompanyId) return;
    const previous = members;
    setMembers((prev) => prev.map((m) => (m.id === memberId ? { ...m, role } : m)));
    try {
      await apiFetch(`/api/admin/members/${memberId}`, {
        method: "PUT",
        body: JSON.stringify({ company_id: activeCompanyId, role }),
      });
      showToast("Role updated", "success");
    } catch (err) {
      // Roll the optimistic change back: leaving the new role on screen after a
      // rejected write would misrepresent who can do what.
      setMembers(previous);
      showToast(err instanceof ApiClientError ? err.message : "Failed to update role", "error");
    }
  };

  const handleRemoveMember = async (memberId: string) => {
    if (!activeCompanyId) return;
    const previous = members;
    setMembers((prev) => prev.filter((m) => m.id !== memberId));
    try {
      await apiFetch(`/api/admin/members/${memberId}?companyId=${activeCompanyId}`, { method: "DELETE" });
      showToast("Member removed", "success");
    } catch (err) {
      setMembers(previous);
      showToast(err instanceof ApiClientError ? err.message : "Failed to remove member", "error");
    }
  };

  if (companyLoading) return <div className="text-sm text-slate-500">Loading workspace…</div>;
  if (!activeCompanyId) return <div className="text-sm text-slate-500">No company selected.</div>;

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-slate-100 tracking-tight">Organization Settings</h1>
        <p className="text-xs text-slate-400">Configure tenant branding, voice defaults, calendar integration, team access, and platform API keys.</p>
      </div>

      <Card className="glass-panel border-white/[0.08] p-6 space-y-4">
        <div className="flex items-center gap-2 text-slate-100 font-bold text-sm border-b border-white/[0.08] pb-3">
          <Globe className="h-4 w-4 text-sky-400" />
          Company Profile
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <SettingField label="Company name" error={errors.name}>
            <input value={name} onChange={(e) => setName(e.target.value)} className="dashboard-input" />
          </SettingField>
          <SettingField label="Company website" hint="shown on the card" error={errors.website}>
            <input value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://example.com" className="dashboard-input" />
          </SettingField>
        </div>
        <Button variant="default" size="sm" onClick={handleSaveProfile} disabled={saving} className="flex items-center gap-2">
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Save className="h-3.5 w-3.5" aria-hidden="true" />}
          Save Profile
        </Button>
      </Card>

      <Card className="glass-panel border-white/[0.08] p-6 space-y-4">
        <div className="flex items-center gap-2 text-slate-100 font-bold text-sm border-b border-white/[0.08] pb-3">
          <Palette className="h-4 w-4 text-fuchsia-400" />
          Branding
        </div>
        <div className="flex items-center gap-4">
          {branding?.logo_storage_path ? (
            // The real logo, not a "Logo set" caption: the point of this tile is
            // to confirm what visitors will actually see.
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={logoUrlOf(branding.logo_storage_path)}
              alt="Current company logo"
              className="h-12 w-12 rounded-lg object-contain bg-white/5 border border-white/10 p-1"
            />
          ) : (
            <div className="h-12 w-12 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-[10px] text-slate-500 text-center leading-tight">
              No logo
            </div>
          )}
          <input
            ref={logoInputRef}
            type="file"
            aria-label="Choose a logo file"
            accept="image/png,image/jpeg,image/svg+xml,image/webp"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleLogoUpload(file);
            }}
          />
          <Button variant="outline" size="sm" onClick={() => logoInputRef.current?.click()} disabled={uploadingLogo} className="flex items-center gap-2">
            {uploadingLogo ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Upload className="h-3.5 w-3.5" aria-hidden="true" />}
            Upload Logo
          </Button>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <SettingField label="Primary colour" error={errors.primaryColor}>
            <div className="flex items-center gap-2">
              <input
                type="color"
                aria-label="Pick a primary colour"
                value={HEX_COLOR.test(primaryColor) ? primaryColor : "#0369a1"}
                onChange={(e) => setPrimaryColor(e.target.value)}
                className="h-8 w-10 rounded border border-white/10 bg-transparent"
              />
              <input value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} className="dashboard-input font-mono" />
            </div>
          </SettingField>
          <SettingField label="Secondary colour" error={errors.secondaryColor}>
            <div className="flex items-center gap-2">
              <input
                type="color"
                aria-label="Pick a secondary colour"
                value={HEX_COLOR.test(secondaryColor) ? secondaryColor : "#0f172a"}
                onChange={(e) => setSecondaryColor(e.target.value)}
                className="h-8 w-10 rounded border border-white/10 bg-transparent"
              />
              <input value={secondaryColor} onChange={(e) => setSecondaryColor(e.target.value)} className="dashboard-input font-mono" />
            </div>
          </SettingField>
        </div>
        <Button variant="default" size="sm" onClick={handleSaveBranding} disabled={saving} className="flex items-center gap-2">
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Save className="h-3.5 w-3.5" aria-hidden="true" />}
          Save Branding
        </Button>
      </Card>

      <Card className="glass-panel border-white/[0.08] p-6 space-y-4">
        <div className="flex items-center gap-2 text-slate-100 font-bold text-sm border-b border-white/[0.08] pb-3">
          <Mic className="h-4 w-4 text-amber-400" />
          Voice, Calendar &amp; Email Defaults
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <SettingField label="Default voice" hint="employees and agents can override">
            {/* A select, not free text: the runtime only accepts these ids, so a
                typed value was silently discarded and the setting appeared to
                do nothing. */}
            <select value={voiceModel} onChange={(e) => setVoiceModel(e.target.value)} className="dashboard-input">
              <option value="">Platform default (nova)</option>
              {SUPPORTED_VOICE_IDS.map((voice) => (
                <option key={voice} value={voice}>
                  {voice}
                </option>
              ))}
            </select>
          </SettingField>
          <SettingField
            label={
              <span className="inline-flex items-center gap-1">
                <CalendarClock className="h-3 w-3" aria-hidden="true" />
                Cal.com event type ID
              </span>
            }
            hint="used by book_appointment"
            error={errors.eventTypeId}
          >
            <input value={eventTypeId} onChange={(e) => setEventTypeId(e.target.value)} className="dashboard-input" placeholder="12345" />
          </SettingField>
          <SettingField label="Booking page URL" hint="shows the card's Book Meeting button" error={errors.bookingUrl}>
            <input value={bookingUrl} onChange={(e) => setBookingUrl(e.target.value)} className="dashboard-input" placeholder="https://cal.com/your-team/30min" />
          </SettingField>
          <SettingField label="Email sender name" hint="appears in the From line">
            <input value={senderName} onChange={(e) => setSenderName(e.target.value)} className="dashboard-input" placeholder="Acme AI Voice" />
          </SettingField>
        </div>
        <Button variant="default" size="sm" onClick={handleSaveVoiceAndCalendar} disabled={saving} className="flex items-center gap-2">
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Save className="h-3.5 w-3.5" aria-hidden="true" />}
          Save Configuration
        </Button>
      </Card>

      <Card className="glass-panel border-white/[0.08] p-6 space-y-4">
        <div className="flex items-center gap-2 text-slate-100 font-bold text-sm border-b border-white/[0.08] pb-3">
          <Languages className="h-4 w-4 text-sky-400" />
          Language Settings
        </div>
        <p className="text-[11px] text-slate-500 -mt-2">
          Controls which languages visitors can choose on this company&rsquo;s voice cards — the pre-conversation language
          screen and the in-call language switcher both only ever offer what&rsquo;s enabled here.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <SettingField label="Default language" hint="used when no preference is set" error={errors.defaultLanguage}>
            <select value={defaultLanguage} onChange={(e) => setDefaultLanguage(e.target.value as LanguageCode | "")} className="dashboard-input">
              <option value="">Platform default (Tamil)</option>
              {SUPPORTED_LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.name} ({l.nativeName})
                </option>
              ))}
            </select>
          </SettingField>
          <SettingField label="Future voice provider" hint="reserved, not yet active">
            {/* Inert placeholder for a per-language voice provider choice —
                every language ships on OpenAI TTS today (see
                LanguageDefinition.futureVoiceProvider); this control exists
                so the setting has a visible home once that lands, without
                implying a capability this release doesn't have. */}
            <select disabled className="dashboard-input opacity-60 cursor-not-allowed">
              <option>OpenAI (platform default)</option>
            </select>
          </SettingField>
        </div>

        <fieldset>
          <legend className="block font-medium text-xs text-slate-300 mb-2">
            Enabled languages
            <span className="ml-2 font-normal text-slate-500">none selected = all languages available</span>
          </legend>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {SUPPORTED_LANGUAGES.map((l) => (
              <label
                key={l.code}
                className="flex items-center gap-2 text-xs text-slate-300 bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.08] rounded-lg px-3 py-2 cursor-pointer transition-colors"
              >
                <input
                  type="checkbox"
                  checked={enabledLanguages.includes(l.code)}
                  onChange={() => toggleEnabledLanguage(l.code)}
                  className="rounded border-white/20 bg-transparent"
                />
                <span aria-hidden="true">{l.flag}</span>
                <span>{l.name}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <Button variant="default" size="sm" onClick={handleSaveLanguageSettings} disabled={saving} className="flex items-center gap-2">
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Save className="h-3.5 w-3.5" aria-hidden="true" />}
          Save Language Settings
        </Button>
      </Card>

      <Card className="glass-panel border-white/[0.08] p-6 space-y-4">
        <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
          <div className="flex items-center gap-2 text-slate-100 font-bold text-sm">
            <Users className="h-4 w-4 text-indigo-400" />
            Team Members
          </div>
          <Button variant="outline" size="sm" onClick={() => { setInviteError(null); setInviteOpen(true); }} className="flex items-center gap-1">
            <UserPlus className="h-3.5 w-3.5" aria-hidden="true" />
            Invite
          </Button>
        </div>
        <p className="text-[11px] text-slate-500">
          Roles control what each person can change. Only Owners and Admins can remove catalog entries or employees; Managers can edit but not delete.
        </p>
        {members.length === 0 ? (
          <p className="text-xs text-slate-500">No members yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-[10px] uppercase tracking-wider text-slate-400 border-b border-white/[0.08]">
                <tr>
                  <th scope="col" className="pb-2 font-semibold">Member</th>
                  <th scope="col" className="pb-2 font-semibold">Status</th>
                  <th scope="col" className="pb-2 font-semibold">Role</th>
                  <th scope="col" className="pb-2 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.06]">
                {members.map((member) => {
                  const label = member.user?.full_name?.trim() || member.user?.email || "Unknown user";
                  return (
                    <tr key={member.id}>
                      <td className="py-2.5">
                        <div className="text-slate-200 font-medium">{label}</div>
                        {member.user?.full_name && <div className="text-slate-500">{member.user.email}</div>}
                      </td>
                      <td className="py-2.5 text-slate-400">{member.status}</td>
                      <td className="py-2.5">
                        <select
                          value={member.role}
                          onChange={(e) => handleChangeRole(member.id, e.target.value as MemberRole)}
                          aria-label={`Role for ${label}`}
                          className="dashboard-input py-1"
                        >
                          {ROLES.map((role) => (
                            <option key={role} value={role}>
                              {role}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="py-2.5 text-right">
                        <Button variant="ghost" size="sm" onClick={() => handleRemoveMember(member.id)} aria-label={`Remove ${label}`}>
                          <Trash2 className="h-3.5 w-3.5 text-rose-400" aria-hidden="true" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card className="glass-panel border-white/[0.08] p-6 space-y-4">
        <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
          <div className="flex items-center gap-2 text-slate-100 font-bold text-sm">
            <Key className="h-4 w-4 text-emerald-400" />
            Platform API Keys
          </div>
          <Button variant="outline" size="sm" onClick={() => setNewKeyDialogOpen(true)} className="flex items-center gap-1">
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
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
                    <Trash2 className="h-3.5 w-3.5 text-rose-400" aria-hidden="true" />
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
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(createdRawKey);
                    showToast("Copied to clipboard", "success");
                  } catch {
                    showToast("Could not copy — your browser blocked clipboard access", "error");
                  }
                }}
                aria-label="Copy API key"
              >
                <Copy className="h-3.5 w-3.5" aria-hidden="true" />
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <SettingField label="Key name">
              <input value={newKeyName} onChange={(e) => setNewKeyName(e.target.value)} className="dashboard-input" placeholder="e.g. Zapier integration" />
            </SettingField>
            <Button variant="default" size="sm" onClick={handleCreateApiKey}>
              Create Key
            </Button>
          </div>
        )}
      </Dialog>

      <Dialog open={inviteOpen} onClose={() => setInviteOpen(false)} title="Invite a team member" size="sm">
        <div className="space-y-3">
          {inviteError && (
            <div role="alert" className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs">
              {inviteError}
            </div>
          )}
          <SettingField label="Email" hint="they must already have an account">
            <input type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} className="dashboard-input" placeholder="teammate@example.com" />
          </SettingField>
          <SettingField label="Role">
            <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value as MemberRole)} className="dashboard-input">
              {ROLES.map((role) => (
                <option key={role} value={role}>
                  {role}
                </option>
              ))}
            </select>
          </SettingField>
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setInviteOpen(false)}>
              Cancel
            </Button>
            <Button variant="default" size="sm" disabled={inviting} onClick={handleInviteMember} className="flex items-center gap-2">
              {inviting && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
              Send invite
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
