"use client";

import React, { useRef, useState } from "react";
import { Loader2, Star } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Field, ImageDropZone } from "@/features/dashboard/components/catalog/CatalogFormPrimitives";
import { Service, CreateServiceSchema } from "@/core/domain/models/types";
import { slugify } from "@/shared/lib/slugify";

/** What the form edits — everything on CreateServiceSchema except tenancy. */
export type ServiceFormValues = {
  name: string;
  slug: string;
  short_description: string;
  description: string;
  category: string;
  price: string; // kept as string while typing; validated to number on submit
  currency: string;
  timeline: string;
  image_path: string | null;
  deliverables: string;
  cta_label: string;
  cta_url: string;
  display_order: string;
  is_featured: boolean;
  is_active: boolean;
};

export function valuesFromService(s: Service | null): ServiceFormValues {
  return {
    name: s?.name ?? "",
    slug: s?.slug ?? "",
    short_description: s?.short_description ?? "",
    description: s?.description ?? "",
    category: s?.category ?? "",
    price: s ? String(s.price) : "",
    currency: s?.currency ?? "USD",
    timeline: s?.timeline ?? "",
    image_path: s?.image_path ?? null,
    deliverables: (s?.deliverables ?? []).join("\n"),
    cta_label: s?.cta_label ?? "",
    cta_url: s?.cta_url ?? "",
    display_order: s ? String(s.display_order ?? 0) : "0",
    is_featured: s?.is_featured ?? false,
    is_active: s?.is_active ?? true,
  };
}

/** Converts form state into the API payload shape, splitting the one-per-line
 * deliverables textarea into an array and empty strings into nulls. */
export function payloadFromValues(v: ServiceFormValues) {
  const lines = (s: string) => s.split("\n").map((l) => l.trim()).filter(Boolean);
  return {
    name: v.name.trim(),
    slug: v.slug.trim() || null,
    short_description: v.short_description.trim() || null,
    description: v.description.trim(),
    category: v.category.trim() || null,
    price: Number(v.price),
    currency: v.currency.trim() || "USD",
    timeline: v.timeline.trim(),
    image_path: v.image_path,
    deliverables: lines(v.deliverables),
    cta_label: v.cta_label.trim() || null,
    cta_url: v.cta_url.trim() || null,
    display_order: Number(v.display_order) || 0,
    is_featured: v.is_featured,
    is_active: v.is_active,
  };
}

/** Validates with the SAME Zod schema the API enforces, so the inline errors a
 * user sees are exactly what the server would have rejected — the form can
 * never pass locally and then 422 remotely. */
export function validateValues(v: ServiceFormValues): Record<string, string> {
  const candidate = payloadFromValues(v);
  if (v.price.trim() === "" || Number.isNaN(candidate.price)) {
    return { price: "Price is required and must be a number" };
  }
  const result = CreateServiceSchema.omit({ company_id: true }).safeParse(candidate);
  if (result.success) return {};
  const errors: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const key = String(issue.path[0] ?? "form");
    if (!errors[key]) errors[key] = issue.message;
  }
  return errors;
}

export function ServiceForm({
  companyId,
  initial,
  submitting,
  serverError,
  onSubmit,
  onCancel,
  publicUrlOf,
}: {
  companyId: string;
  initial: Service | null;
  submitting: boolean;
  serverError: string | null;
  onSubmit: (payload: ReturnType<typeof payloadFromValues>) => void;
  onCancel: () => void;
  publicUrlOf: (path: string) => string;
}) {
  const [values, setValues] = useState<ServiceFormValues>(() => valuesFromService(initial));
  const [errors, setErrors] = useState<Record<string, string>>({});
  // Auto-derivation from the name stops the moment the admin edits the slug by
  // hand, so an intentional slug is never overwritten.
  const slugTouched = useRef(Boolean(initial?.slug));

  const set = <K extends keyof ServiceFormValues>(key: K, value: ServiceFormValues[K]) => {
    setValues((v) => ({ ...v, [key]: value }));
    if (errors[key]) setErrors((e) => ({ ...e, [key]: "" }));
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const validation = validateValues(values);
    setErrors(validation);
    if (Object.keys(validation).length > 0) return;
    onSubmit(payloadFromValues(values));
  };

  return (
    <form onSubmit={submit} className="space-y-4 text-sm" noValidate>
      {serverError && (
        <div role="alert" className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs">
          {serverError}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Name" error={errors.name}>
          <input
            value={values.name}
            onChange={(e) => {
              set("name", e.target.value);
              if (!slugTouched.current) set("slug", slugify(e.target.value));
            }}
            className="dashboard-input"
            placeholder="e.g. Workflow Automation"
            aria-invalid={Boolean(errors.name)}
          />
        </Field>
        <Field label="Slug" error={errors.slug} hint="Lowercase letters, numbers, hyphens">
          <input
            value={values.slug}
            onChange={(e) => {
              slugTouched.current = true;
              set("slug", e.target.value);
            }}
            className="dashboard-input font-mono"
            placeholder="workflow-automation"
            aria-invalid={Boolean(errors.slug)}
          />
        </Field>
      </div>

      <Field label="Short description" error={errors.short_description} hint="Shown on the public card (max 280 chars)">
        <input value={values.short_description} onChange={(e) => set("short_description", e.target.value)} maxLength={280} className="dashboard-input" />
      </Field>

      <Field label="Full description" error={errors.description} hint="What the AI uses in conversation">
        <textarea
          value={values.description}
          onChange={(e) => set("description", e.target.value)}
          rows={3}
          className="dashboard-input"
          aria-invalid={Boolean(errors.description)}
        />
      </Field>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Field label="Category" error={errors.category}>
          <input value={values.category} onChange={(e) => set("category", e.target.value)} className="dashboard-input" placeholder="Consulting" />
        </Field>
        <Field label="Price" error={errors.price}>
          <input value={values.price} onChange={(e) => set("price", e.target.value)} inputMode="decimal" className="dashboard-input" aria-invalid={Boolean(errors.price)} />
        </Field>
        <Field label="Currency" error={errors.currency}>
          <input value={values.currency} onChange={(e) => set("currency", e.target.value.toUpperCase())} maxLength={10} className="dashboard-input" />
        </Field>
        <Field label="Display order" error={errors.display_order} hint="Lower first">
          <input value={values.display_order} onChange={(e) => set("display_order", e.target.value)} inputMode="numeric" className="dashboard-input" />
        </Field>
      </div>

      {/* Free text rather than a number + unit: real engagements are quoted as
          ranges ("2-6 weeks", "one afternoon"), which a numeric field cannot
          express without implying precision that isn't there. */}
      <Field label="Duration" error={errors.timeline} hint="Free text, e.g. “2–6 weeks to first automation live”">
        <input value={values.timeline} onChange={(e) => set("timeline", e.target.value)} maxLength={100} className="dashboard-input" />
      </Field>

      <ImageDropZone
        companyId={companyId}
        uploadUrl="/api/admin/services/image"
        label="Service image"
        currentPath={values.image_path}
        publicUrlOf={publicUrlOf}
        onUploaded={(path) => set("image_path", path)}
        onRemove={() => set("image_path", null)}
      />

      <Field label="Deliverables" hint="One per line" error={errors.deliverables}>
        <textarea value={values.deliverables} onChange={(e) => set("deliverables", e.target.value)} rows={4} className="dashboard-input" />
      </Field>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="CTA label" error={errors.cta_label} hint="Button text on the card">
          <input value={values.cta_label} onChange={(e) => set("cta_label", e.target.value)} maxLength={60} className="dashboard-input" placeholder="Book a consult" />
        </Field>
        <Field label="CTA link" error={errors.cta_url}>
          <input value={values.cta_url} onChange={(e) => set("cta_url", e.target.value)} className="dashboard-input" placeholder="https://…" aria-invalid={Boolean(errors.cta_url)} />
        </Field>
      </div>

      <div className="flex flex-wrap items-center gap-5 pt-1">
        <label className="flex items-center gap-2 text-xs text-slate-300">
          <input type="checkbox" checked={values.is_active} onChange={(e) => set("is_active", e.target.checked)} />
          Active — visible on the card and to the AI
        </label>
        <label className="flex items-center gap-2 text-xs text-slate-300">
          <input type="checkbox" checked={values.is_featured} onChange={(e) => set("is_featured", e.target.checked)} />
          <Star className="h-3 w-3 text-amber-400" aria-hidden="true" />
          Featured
        </label>
      </div>

      <div className="flex justify-end gap-2 pt-2 border-t border-white/[0.06]">
        <Button type="button" variant="outline" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" variant="default" size="sm" disabled={submitting}>
          {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : initial ? "Save changes" : "Create service"}
        </Button>
      </div>
    </form>
  );
}
