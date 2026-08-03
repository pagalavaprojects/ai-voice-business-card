"use client";

import React, { useCallback, useRef, useState } from "react";
import { ImagePlus, Loader2, X } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/shared/ui/card";

/**
 * Form and table primitives shared by the catalog modules (Products,
 * Services).
 *
 * Extracted rather than copied: the two modules differ in their fields and
 * columns, but the upload mechanics, field chrome, stat tiles and row actions
 * are identical. Duplicating them would have meant ~250 lines of near-identical
 * code drifting apart the first time one module fixed a bug the other kept.
 * What stays module-specific is what genuinely differs — schemas, repositories,
 * routes, and the column sets.
 */

/** XMLHttpRequest rather than fetch purely for upload progress events — fetch
 * still has no standard way to observe request-body progress. */
export function uploadWithProgress(
  url: string,
  formData: FormData,
  onProgress: (pct: number) => void
): Promise<{ path: string; url: string }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      try {
        const json = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300) resolve(json.data);
        else reject(new Error(json.message || `Upload failed (${xhr.status})`));
      } catch {
        reject(new Error(`Upload failed (${xhr.status})`));
      }
    };
    xhr.onerror = () => reject(new Error("Upload failed — network error"));
    xhr.send(formData);
  });
}

export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-[11px] uppercase tracking-wide text-slate-500 mb-1">
        {label}
        {hint && <span className="normal-case tracking-normal text-slate-600 ml-2">{hint}</span>}
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

/** Drag-and-drop image upload with a real progress bar. `uploadUrl` differs
 * per module so each writes to its own storage bucket. */
export function ImageDropZone({
  companyId,
  uploadUrl,
  label,
  currentPath,
  publicUrlOf,
  onUploaded,
  onRemove,
}: {
  companyId: string;
  uploadUrl: string;
  label: string;
  currentPath: string | null;
  publicUrlOf: (path: string) => string;
  onUploaded: (path: string) => void;
  onRemove: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const handleFile = useCallback(
    async (file: File) => {
      setUploading(true);
      setProgress(0);
      setError(null);
      const formData = new FormData();
      formData.append("companyId", companyId);
      formData.append("file", file);
      try {
        const result = await uploadWithProgress(uploadUrl, formData, setProgress);
        onUploaded(result.path);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Upload failed");
      } finally {
        setUploading(false);
      }
    },
    [companyId, uploadUrl, onUploaded]
  );

  return (
    <div>
      <span className="block text-[11px] uppercase tracking-wide text-slate-500 mb-1">{label}</span>
      {currentPath ? (
        <div className="relative inline-block">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={publicUrlOf(currentPath)} alt="" className="h-20 w-20 rounded-xl object-cover border border-white/[0.1]" />
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Remove ${label.toLowerCase()}`}
            className="absolute -top-2 -right-2 h-5 w-5 rounded-full bg-slate-800 border border-white/20 text-slate-300 hover:text-rose-300 flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-sky-500"
          >
            <X className="h-3 w-3" aria-hidden="true" />
          </button>
        </div>
      ) : (
        <div
          role="button"
          tabIndex={0}
          aria-label={`Upload ${label.toLowerCase()} — PNG, JPEG or WebP, up to 5MB`}
          onClick={() => inputRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              inputRef.current?.click();
            }
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            const file = e.dataTransfer.files?.[0];
            if (file) handleFile(file);
          }}
          className={`h-20 w-full max-w-[16rem] rounded-xl border border-dashed flex items-center justify-center gap-2 text-xs cursor-pointer transition-colors focus:outline-none focus:ring-2 focus:ring-sky-500 ${
            dragOver ? "border-sky-400/60 bg-sky-500/10 text-sky-300" : "border-white/[0.15] text-slate-400 hover:border-white/[0.3]"
          }`}
        >
          {uploading ? (
            <span className="flex items-center gap-2">
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              {progress}%
            </span>
          ) : (
            <>
              <ImagePlus className="h-4 w-4" aria-hidden="true" />
              Drop image or click
            </>
          )}
        </div>
      )}
      {uploading && (
        <div
          className="mt-1.5 h-1 w-full max-w-[16rem] bg-white/[0.06] rounded-full overflow-hidden"
          role="progressbar"
          aria-valuenow={progress}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div className="h-full bg-sky-400 transition-all" style={{ width: `${progress}%` }} />
        </div>
      )}
      {error && (
        <p role="alert" className="text-[11px] text-rose-300 mt-1">
          {error}
        </p>
      )}
      <input
        ref={inputRef}
        type="file"
        // Labelled even though it is visually hidden: `.hidden` removes it
        // from view but not from the accessibility tree, so without this a
        // screen reader announces an unlabelled file control. Caught by an
        // axe scan of this form (WCAG 4.1.2), not by eye.
        aria-label={`Choose ${label.toLowerCase()} file`}
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
          e.target.value = "";
        }}
      />
    </div>
  );
}

/** Small square drop zone used for gallery slots. */
export function ImageDropZoneCompact({
  companyId,
  uploadUrl,
  onUploaded,
}: {
  companyId: string;
  uploadUrl: string;
  onUploaded: (path: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleFile = async (file: File) => {
    setUploading(true);
    const formData = new FormData();
    formData.append("companyId", companyId);
    formData.append("file", file);
    try {
      const result = await uploadWithProgress(uploadUrl, formData, () => {});
      onUploaded(result.path);
    } catch {
      // The main drop zone surfaces upload errors verbosely; a failed gallery
      // slot simply stays empty and can be retried.
    } finally {
      setUploading(false);
    }
  };

  return (
    <>
      <button
        type="button"
        aria-label="Add gallery image"
        onClick={() => inputRef.current?.click()}
        className="h-14 w-14 rounded-lg border border-dashed border-white/[0.15] text-slate-500 hover:border-white/[0.3] hover:text-slate-300 flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-sky-500"
      >
        {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <ImagePlus className="h-3.5 w-3.5" aria-hidden="true" />}
      </button>
      <input
        ref={inputRef}
        type="file"
        aria-label="Choose gallery image file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
          e.target.value = "";
        }}
      />
    </>
  );
}

export function StatTile({ title, value, icon }: { title: string; value: number; icon: React.ReactNode }) {
  return (
    <Card className="glass-panel border-white/[0.08]">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-xs font-semibold text-slate-400">{title}</CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-extrabold text-slate-100 font-mono tabular-nums">{value}</div>
      </CardContent>
    </Card>
  );
}

export function IconButton({
  label,
  onClick,
  children,
  disabled,
  danger,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={`h-7 w-7 rounded-lg flex items-center justify-center border border-white/[0.08] bg-white/[0.03] transition-colors focus:outline-none focus:ring-2 focus:ring-sky-500 disabled:opacity-40 ${
        danger ? "text-slate-400 hover:text-rose-300 hover:border-rose-400/30" : "text-slate-400 hover:text-sky-300 hover:border-sky-400/30"
      }`}
    >
      {children}
    </button>
  );
}

/** Products and Services images live in public buckets, so the URL is
 * derivable client-side without a round trip per image. */
export function makePublicUrlResolver(bucket: string): (path: string) => string {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  return (path: string) => `${base}/storage/v1/object/public/${bucket}/${path}`;
}
