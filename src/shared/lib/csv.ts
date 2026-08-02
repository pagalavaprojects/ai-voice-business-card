/**
 * Minimal RFC 4180 CSV builder for client-side exports of selected rows.
 * (Full-dataset exports go through the server-side path that pages through
 * everything and returns a signed URL — see /api/admin/leads/export.)
 *
 * Quoting rule: any field containing a comma, quote or newline is wrapped and
 * inner quotes doubled — a product named `27" Monitor, Black` must not shift
 * every following column one cell to the right in Excel.
 */
export function toCsv(headers: string[], rows: Array<Array<string | number | boolean | null | undefined>>): string {
  const escape = (value: string | number | boolean | null | undefined): string => {
    if (value === null || value === undefined) return "";
    const s = String(value);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers, ...rows].map((row) => row.map(escape).join(",")).join("\r\n");
}

export function downloadCsv(filename: string, csv: string): void {
  // BOM so Excel detects UTF-8 — without it, non-ASCII product names mojibake.
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
