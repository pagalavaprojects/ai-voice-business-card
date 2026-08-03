"use client";

import React, { useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Field, ImageDropZone } from "@/features/dashboard/components/catalog/CatalogFormPrimitives";
import { Employee, CreateEmployeeSchema, SUPPORTED_VOICE_IDS } from "@/core/domain/models/types";

/** What the form edits — everything on CreateEmployeeSchema except tenancy. */
export type EmployeeFormValues = {
  name: string;
  designation: string;
  email: string;
  phone: string;
  office_address: string;
  working_hours: string;
  timezone: string;
  avatar_path: string | null;
  voice_id: string;
  prompt_override: string;
  /** One "label|url" pair per line, which is how an admin actually thinks
   * about this — a key/value grid for two or three links is more chrome than
   * content. Parsed back into the record the schema expects on submit. */
  social_links: string;
  display_order: string;
  is_active: boolean;
};

export function valuesFromEmployee(e: Employee | null): EmployeeFormValues {
  return {
    name: e?.name ?? "",
    designation: e?.designation ?? "",
    email: e?.email ?? "",
    phone: e?.phone ?? "",
    office_address: e?.office_address ?? "",
    working_hours: e?.working_hours ?? "",
    timezone: e?.timezone ?? "",
    avatar_path: e?.avatar_path ?? null,
    voice_id: e?.voice_id ?? "",
    prompt_override: e?.prompt_override ?? "",
    social_links: Object.entries(e?.social_links ?? {})
      .map(([label, url]) => `${label}|${url}`)
      .join("\n"),
    display_order: e ? String(e.display_order ?? 0) : "0",
    is_active: e?.is_active ?? true,
  };
}

/** Splits the "label|url" textarea. A line with no separator is kept as a
 * label with an empty URL rather than dropped, so Zod reports it as an invalid
 * URL instead of the row silently vanishing on save. */
function parseSocialLinks(raw: string): Record<string, string> {
  const entries: Record<string, string> = {};
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const separator = trimmed.indexOf("|");
    const label = (separator === -1 ? trimmed : trimmed.slice(0, separator)).trim();
    const url = separator === -1 ? "" : trimmed.slice(separator + 1).trim();
    if (label) entries[label] = url;
  }
  return entries;
}

/** Converts form state into the API payload shape, turning empty strings into
 * nulls so an unset optional field is stored as NULL rather than "". */
export function payloadFromValues(v: EmployeeFormValues) {
  const links = parseSocialLinks(v.social_links);
  return {
    name: v.name.trim(),
    designation: v.designation.trim(),
    email: v.email.trim(),
    phone: v.phone.trim(),
    office_address: v.office_address.trim() || null,
    working_hours: v.working_hours.trim() || null,
    timezone: v.timezone.trim() || null,
    avatar_path: v.avatar_path,
    // Empty means "inherit the agent's voice", which is the column's whole
    // purpose — sending "" would fail the enum and read as a broken form.
    voice_id: v.voice_id.trim() || null,
    prompt_override: v.prompt_override.trim() || null,
    social_links: Object.keys(links).length > 0 ? links : null,
    display_order: Number(v.display_order) || 0,
    is_active: v.is_active,
  };
}

/** Validates with the SAME Zod schema the API enforces, so the inline errors a
 * user sees are exactly what the server would have rejected — the form can
 * never pass locally and then 422 remotely. */
export function validateValues(v: EmployeeFormValues): Record<string, string> {
  const result = CreateEmployeeSchema.omit({ company_id: true }).safeParse(payloadFromValues(v));
  if (result.success) return {};
  const errors: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const key = String(issue.path[0] ?? "form");
    if (!errors[key]) errors[key] = issue.message;
  }
  return errors;
}

export function EmployeeForm({
  companyId,
  initial,
  submitting,
  serverError,
  onSubmit,
  onCancel,
  publicUrlOf,
}: {
  companyId: string;
  initial: Employee | null;
  submitting: boolean;
  serverError: string | null;
  onSubmit: (payload: ReturnType<typeof payloadFromValues>) => void;
  onCancel: () => void;
  publicUrlOf: (path: string) => string;
}) {
  const [values, setValues] = useState<EmployeeFormValues>(() => valuesFromEmployee(initial));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const firstFieldRef = useRef<HTMLInputElement>(null);

  const set = <K extends keyof EmployeeFormValues>(key: K, value: EmployeeFormValues[K]) => {
    setValues((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => (prev[key as string] ? { ...prev, [key as string]: "" } : prev));
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const found = validateValues(values);
    if (Object.keys(found).length > 0) {
      setErrors(found);
      // Move focus to the first invalid control rather than only colouring it:
      // a keyboard or screen-reader user otherwise gets no signal that the
      // submit did nothing (WCAG 3.3.1).
      const firstKey = Object.keys(found)[0];
      document.getElementById(`employee-${firstKey}`)?.focus();
      return;
    }
    onSubmit(payloadFromValues(values));
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {serverError && (
        <div role="alert" className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs">
          {serverError}
        </div>
      )}

      <div className="grid sm:grid-cols-2 gap-4">
        <Field label="Full name" error={errors.name}>
          <input
            id="employee-name"
            ref={firstFieldRef}
            value={values.name}
            onChange={(e) => set("name", e.target.value)}
            className="dashboard-input"
            autoComplete="off"
          />
        </Field>
        <Field label="Designation" error={errors.designation}>
          <input
            id="employee-designation"
            value={values.designation}
            onChange={(e) => set("designation", e.target.value)}
            placeholder="Head of Growth"
            className="dashboard-input"
          />
        </Field>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <Field label="Email" error={errors.email}>
          <input id="employee-email" type="email" value={values.email} onChange={(e) => set("email", e.target.value)} className="dashboard-input" />
        </Field>
        <Field label="Phone" hint="include country code" error={errors.phone}>
          <input id="employee-phone" value={values.phone} onChange={(e) => set("phone", e.target.value)} className="dashboard-input" />
        </Field>
      </div>

      <Field label="Office address" error={errors.office_address}>
        <input
          id="employee-office_address"
          value={values.office_address}
          onChange={(e) => set("office_address", e.target.value)}
          className="dashboard-input"
        />
      </Field>

      <div className="grid sm:grid-cols-2 gap-4">
        <Field label="Working hours" hint="spoken by the assistant" error={errors.working_hours}>
          <input
            id="employee-working_hours"
            value={values.working_hours}
            onChange={(e) => set("working_hours", e.target.value)}
            placeholder="9 AM – 6 PM, Mon–Fri"
            className="dashboard-input"
          />
        </Field>
        <Field label="Timezone" error={errors.timezone}>
          <input
            id="employee-timezone"
            value={values.timezone}
            onChange={(e) => set("timezone", e.target.value)}
            placeholder="Asia/Kolkata"
            className="dashboard-input"
          />
        </Field>
      </div>

      <ImageDropZone
        companyId={companyId}
        uploadUrl="/api/admin/employees/avatar"
        label="Profile photo"
        currentPath={values.avatar_path}
        publicUrlOf={publicUrlOf}
        onUploaded={(path) => set("avatar_path", path)}
        onRemove={() => set("avatar_path", null)}
      />

      <div className="grid sm:grid-cols-2 gap-4">
        <Field label="Voice" hint="blank inherits the agent's" error={errors.voice_id}>
          <select id="employee-voice_id" value={values.voice_id} onChange={(e) => set("voice_id", e.target.value)} className="dashboard-input">
            <option value="">Inherit from agent</option>
            {SUPPORTED_VOICE_IDS.map((voice) => (
              <option key={voice} value={voice}>
                {voice}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Display order" hint="lowest first on the roster" error={errors.display_order}>
          <input
            id="employee-display_order"
            type="number"
            min={0}
            value={values.display_order}
            onChange={(e) => set("display_order", e.target.value)}
            className="dashboard-input"
          />
        </Field>
      </div>

      <Field label="Social links" hint="one per line, as label|https://…" error={errors.social_links}>
        <textarea
          id="employee-social_links"
          rows={3}
          value={values.social_links}
          onChange={(e) => set("social_links", e.target.value)}
          placeholder={"LinkedIn|https://linkedin.com/in/…\nX|https://x.com/…"}
          className="dashboard-input font-mono text-[11px]"
        />
      </Field>

      <Field label="Assistant notes" hint="added to this person's prompt only" error={errors.prompt_override}>
        <textarea
          id="employee-prompt_override"
          rows={4}
          value={values.prompt_override}
          onChange={(e) => set("prompt_override", e.target.value)}
          placeholder="e.g. Always mention that I cover the APAC region and can meet in person in Singapore."
          className="dashboard-input"
        />
      </Field>

      <label className="flex items-center gap-2 text-xs text-slate-300">
        <input type="checkbox" checked={values.is_active} onChange={(e) => set("is_active", e.target.checked)} />
        Active — the business card is reachable and the assistant answers calls
      </label>

      <div className="flex justify-end gap-2 pt-2 border-t border-white/[0.06]">
        <Button type="button" variant="outline" size="sm" onClick={onCancel} className="text-xs">
          Cancel
        </Button>
        <Button type="submit" variant="default" size="sm" disabled={submitting} className="text-xs flex items-center gap-2">
          {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
          {initial ? "Save changes" : "Create employee"}
        </Button>
      </div>
    </form>
  );
}
