"use client";

import React, { useRef, useState } from "react";
import { Loader2, Star, X } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Field, ImageDropZone, ImageDropZoneCompact } from "@/features/dashboard/components/catalog/CatalogFormPrimitives";
import { Product, CreateProductSchema } from "@/core/domain/models/types";
import { slugify } from "@/shared/lib/slugify";

/** What the form edits — everything on CreateProductSchema except tenancy. */
export type ProductFormValues = {
  name: string;
  slug: string;
  short_description: string;
  description: string;
  category: string;
  pricing: string; // kept as string while typing; validated to number on submit
  currency: string;
  discount_percent: string;
  sku: string;
  image_path: string | null;
  gallery_paths: string[];
  features: string;
  benefits: string;
  cta_label: string;
  cta_url: string;
  target_audience: string;
  display_order: string;
  is_featured: boolean;
  is_active: boolean;
};

export function valuesFromProduct(p: Product | null): ProductFormValues {
  return {
    name: p?.name ?? "",
    slug: p?.slug ?? "",
    short_description: p?.short_description ?? "",
    description: p?.description ?? "",
    category: p?.category ?? "",
    pricing: p ? String(p.pricing) : "",
    currency: p?.currency ?? "USD",
    discount_percent: p ? String(p.discount_percent ?? 0) : "0",
    sku: p?.sku ?? "",
    image_path: p?.image_path ?? null,
    gallery_paths: p?.gallery_paths ?? [],
    features: (p?.features ?? []).join("\n"),
    benefits: (p?.benefits ?? []).join("\n"),
    cta_label: p?.cta_label ?? "",
    cta_url: p?.cta_url ?? "",
    target_audience: p?.target_audience ?? "",
    display_order: p ? String(p.display_order ?? 0) : "0",
    is_featured: p?.is_featured ?? false,
    is_active: p?.is_active ?? true,
  };
}

/** Converts form state into the API payload shape, splitting one-per-line
 * textareas into arrays and empty strings into nulls. */
export function payloadFromValues(v: ProductFormValues) {
  const lines = (s: string) => s.split("\n").map((l) => l.trim()).filter(Boolean);
  return {
    name: v.name.trim(),
    slug: v.slug.trim() || null,
    short_description: v.short_description.trim() || null,
    description: v.description.trim(),
    category: v.category.trim() || null,
    pricing: Number(v.pricing),
    currency: v.currency.trim() || "USD",
    discount_percent: Number(v.discount_percent) || 0,
    sku: v.sku.trim() || null,
    image_path: v.image_path,
    gallery_paths: v.gallery_paths,
    features: lines(v.features),
    benefits: lines(v.benefits),
    cta_label: v.cta_label.trim() || null,
    cta_url: v.cta_url.trim() || null,
    target_audience: v.target_audience.trim() || null,
    display_order: Number(v.display_order) || 0,
    is_featured: v.is_featured,
    is_active: v.is_active,
  };
}

/** Validates with the SAME Zod schema the API enforces, so the inline errors
 * a user sees are exactly what the server would have rejected — the form can
 * never pass locally and then 422 remotely. */
export function validateValues(v: ProductFormValues): Record<string, string> {
  const candidate = payloadFromValues(v);
  if (v.pricing.trim() === "" || Number.isNaN(candidate.pricing)) {
    return { pricing: "Price is required and must be a number" };
  }
  const result = CreateProductSchema.omit({ company_id: true }).safeParse(candidate);
  if (result.success) return {};
  const errors: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const key = String(issue.path[0] ?? "form");
    if (!errors[key]) errors[key] = issue.message;
  }
  return errors;
}

export function ProductForm({
  companyId,
  initial,
  submitting,
  serverError,
  onSubmit,
  onCancel,
  publicUrlOf,
}: {
  companyId: string;
  initial: Product | null;
  submitting: boolean;
  serverError: string | null;
  onSubmit: (payload: ReturnType<typeof payloadFromValues>) => void;
  onCancel: () => void;
  publicUrlOf: (path: string) => string;
}) {
  const [values, setValues] = useState<ProductFormValues>(() => valuesFromProduct(initial));
  const [errors, setErrors] = useState<Record<string, string>>({});
  // Track whether the admin edited the slug by hand; auto-derivation from the
  // name stops the moment they do, so we never overwrite an intentional slug.
  const slugTouched = useRef(Boolean(initial?.slug));

  const set = <K extends keyof ProductFormValues>(key: K, value: ProductFormValues[K]) => {
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
            placeholder="e.g. AI Starter Plan"
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
            placeholder="ai-starter-plan"
            aria-invalid={Boolean(errors.slug)}
          />
        </Field>
      </div>

      <Field label="Short description" error={errors.short_description} hint="Shown on the public card (max 280 chars)">
        <input value={values.short_description} onChange={(e) => set("short_description", e.target.value)} maxLength={280} className="dashboard-input" />
      </Field>

      <Field label="Full description" error={errors.description} hint="What the AI uses in conversation">
        <textarea value={values.description} onChange={(e) => set("description", e.target.value)} rows={3} className="dashboard-input" aria-invalid={Boolean(errors.description)} />
      </Field>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Field label="Category" error={errors.category}>
          <input value={values.category} onChange={(e) => set("category", e.target.value)} className="dashboard-input" placeholder="Subscription" />
        </Field>
        <Field label="Price" error={errors.pricing}>
          <input value={values.pricing} onChange={(e) => set("pricing", e.target.value)} inputMode="decimal" className="dashboard-input" aria-invalid={Boolean(errors.pricing)} />
        </Field>
        <Field label="Currency" error={errors.currency}>
          <input value={values.currency} onChange={(e) => set("currency", e.target.value.toUpperCase())} maxLength={10} className="dashboard-input" />
        </Field>
        <Field label="Discount %" error={errors.discount_percent}>
          <input value={values.discount_percent} onChange={(e) => set("discount_percent", e.target.value)} inputMode="decimal" className="dashboard-input" />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Field label="SKU" error={errors.sku}>
          <input value={values.sku} onChange={(e) => set("sku", e.target.value)} className="dashboard-input font-mono" />
        </Field>
        <Field label="Display order" error={errors.display_order} hint="Lower shows first on the card">
          <input value={values.display_order} onChange={(e) => set("display_order", e.target.value)} inputMode="numeric" className="dashboard-input" />
        </Field>
      </div>

      <ImageDropZone
        companyId={companyId}
        uploadUrl="/api/admin/products/image"
        label="Product image"
        currentPath={values.image_path}
        publicUrlOf={publicUrlOf}
        onUploaded={(path) => set("image_path", path)}
        onRemove={() => set("image_path", null)}
      />

      <div>
        <span className="block text-[11px] uppercase tracking-wide text-slate-500 mb-1">Gallery</span>
        <div className="flex flex-wrap gap-2">
          {values.gallery_paths.map((path) => (
            <div key={path} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={publicUrlOf(path)} alt="" className="h-14 w-14 rounded-lg object-cover border border-white/[0.1]" />
              <button
                type="button"
                aria-label="Remove gallery image"
                onClick={() => set("gallery_paths", values.gallery_paths.filter((p) => p !== path))}
                className="absolute -top-1.5 -right-1.5 h-4 w-4 rounded-full bg-slate-800 border border-white/20 text-slate-300 hover:text-rose-300 flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-sky-500"
              >
                <X className="h-2.5 w-2.5" aria-hidden="true" />
              </button>
            </div>
          ))}
          <ImageDropZoneCompact
            companyId={companyId}
            uploadUrl="/api/admin/products/image"
            onUploaded={(path) => set("gallery_paths", [...values.gallery_paths, path])}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Features" hint="One per line" error={errors.features}>
          <textarea value={values.features} onChange={(e) => set("features", e.target.value)} rows={3} className="dashboard-input" />
        </Field>
        <Field label="Benefits" hint="One per line" error={errors.benefits}>
          <textarea value={values.benefits} onChange={(e) => set("benefits", e.target.value)} rows={3} className="dashboard-input" />
        </Field>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="CTA label" error={errors.cta_label} hint="Button text on the card">
          <input value={values.cta_label} onChange={(e) => set("cta_label", e.target.value)} maxLength={60} className="dashboard-input" placeholder="Learn more" />
        </Field>
        <Field label="CTA link" error={errors.cta_url}>
          <input value={values.cta_url} onChange={(e) => set("cta_url", e.target.value)} className="dashboard-input" placeholder="https://…" aria-invalid={Boolean(errors.cta_url)} />
        </Field>
      </div>

      <Field label="Target audience" error={errors.target_audience}>
        <input value={values.target_audience} onChange={(e) => set("target_audience", e.target.value)} className="dashboard-input" />
      </Field>

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
          {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : initial ? "Save changes" : "Create product"}
        </Button>
      </div>
    </form>
  );
}
