"use client";

import React, { useId, useState } from "react";

/**
 * Hand-rolled SVG charts.
 *
 * No charting library: the whole set below is a few hundred bytes of markup,
 * where recharts/chart.js would add tens of kilobytes to an admin bundle for
 * three simple forms. It also keeps the marks under direct control, which is
 * what the spacing and hover rules below require.
 *
 * Palette is fixed and was validated against this app's real panel surface
 * (#13171f — the page plane #090d16 under the 4%-white glass panel) rather
 * than eyeballed: categorical/ordinal steps clear the lightness band, chroma
 * floor, CVD separation, normal-vision floor and 3:1 contrast.
 */
const SERIES = "#3987e5";
/** Ordinal ramp, light→dark. Stops at #184f95: on a dark surface anything
 * darker than step 600 drops below the 2:1 floor and disappears into it. */
const ORDINAL = ["#b7d3f6", "#86b6ef", "#5598e7", "#2a78d6", "#184f95"];
const STATUS = { good: "#0ca30c", critical: "#d03b3b" };
const GRID = "#2c2c2a";
const AXIS = "#383835";

export const CHART_COLORS = { SERIES, ORDINAL, STATUS };

function formatDayLabel(key: string): string {
  const d = new Date(`${key}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? key : d.toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
}

// ---------------------------------------------------------------------------
// Time series — call volume
// ---------------------------------------------------------------------------

export function CallVolumeChart({ data, label = "Calls" }: { data: Array<{ key: string; calls: number }>; label?: string }) {
  const gradientId = useId();
  const [hover, setHover] = useState<number | null>(null);

  if (data.length === 0) return <EmptyPlot message="No calls in this period yet." />;

  const W = 720;
  const H = 200;
  const PAD = { top: 12, right: 12, bottom: 26, left: 34 };
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;

  const max = Math.max(1, ...data.map((d) => d.calls));
  const x = (i: number) => PAD.left + (data.length === 1 ? plotW / 2 : (i / (data.length - 1)) * plotW);
  const y = (v: number) => PAD.top + plotH - (v / max) * plotH;

  const line = data.map((d, i) => `${i === 0 ? "M" : "L"} ${x(i)} ${y(d.calls)}`).join(" ");
  const area = `${line} L ${x(data.length - 1)} ${PAD.top + plotH} L ${x(0)} ${PAD.top + plotH} Z`;

  // Three gridlines is enough to read magnitude without competing with the data.
  const ticks = [0, Math.round(max / 2), max].filter((v, i, a) => a.indexOf(v) === i);

  return (
    <figure className="m-0">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label={`${label} over time. Peak ${max}.`}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={SERIES} stopOpacity="0.28" />
            <stop offset="100%" stopColor={SERIES} stopOpacity="0" />
          </linearGradient>
        </defs>

        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} stroke={GRID} strokeWidth="1" />
            <text x={PAD.left - 7} y={y(t) + 3.5} textAnchor="end" fontSize="10" fill="#898781" fontVariant="tabular-nums">
              {t}
            </text>
          </g>
        ))}

        <path d={area} fill={`url(#${gradientId})`} />
        <path d={line} fill="none" stroke={SERIES} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />

        {hover !== null && (
          <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={PAD.top + plotH} stroke={SERIES} strokeWidth="1" strokeDasharray="3 3" />
        )}
        {hover !== null && <circle cx={x(hover)} cy={y(data[hover].calls)} r="4.5" fill={SERIES} stroke="#13171f" strokeWidth="2" />}

        {/* First and last only — labelling every point turns the axis into noise. */}
        <text x={x(0)} y={H - 8} textAnchor="start" fontSize="10" fill="#898781">
          {formatDayLabel(data[0].key)}
        </text>
        {data.length > 1 && (
          <text x={x(data.length - 1)} y={H - 8} textAnchor="end" fontSize="10" fill="#898781">
            {formatDayLabel(data[data.length - 1].key)}
          </text>
        )}

        {/* Full-height hit targets: far easier to hit than the 2px line itself. */}
        {data.map((d, i) => (
          <rect
            key={d.key}
            x={x(i) - plotW / (2 * Math.max(1, data.length - 1))}
            y={PAD.top}
            width={plotW / Math.max(1, data.length - 1)}
            height={plotH}
            fill="transparent"
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
          />
        ))}
      </svg>

      <figcaption className="text-xs text-slate-400 mt-1 h-4" aria-live="polite">
        {hover !== null ? `${formatDayLabel(data[hover].key)}: ${data[hover].calls} ${data[hover].calls === 1 ? "call" : "calls"}` : ""}
      </figcaption>
    </figure>
  );
}

// ---------------------------------------------------------------------------
// Funnel — ordered stages
// ---------------------------------------------------------------------------

export function FunnelChart({ data, emptyMessage }: { data: Array<{ stage: string; count: number }>; emptyMessage: string }) {
  const total = data.reduce((sum, d) => sum + d.count, 0);
  if (total === 0) return <EmptyPlot message={emptyMessage} />;

  const max = Math.max(...data.map((d) => d.count));

  return (
    <ul className="space-y-2.5">
      {data.map((d, i) => (
        <li key={d.stage} className="grid grid-cols-[7rem_1fr_2.5rem] items-center gap-3">
          <span className="text-[11px] text-slate-300 truncate">{d.stage}</span>
          <div className="h-5 bg-white/[0.04] rounded-md overflow-hidden">
            <div
              className="h-full rounded-md"
              // 4px rounded data-end anchored to the baseline; width is the
              // only magnitude channel, colour just orders the stages.
              style={{ width: `${max > 0 ? Math.max(2, (d.count / max) * 100) : 0}%`, background: ORDINAL[Math.min(i, ORDINAL.length - 1)] }}
            />
          </div>
          <span className="text-xs font-mono text-slate-200 tabular-nums text-right">{d.count}</span>
        </li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// Horizontal comparison — magnitude across entities (single hue, not categorical:
// these are one measure compared across rows, not distinct identities)
// ---------------------------------------------------------------------------

export function ComparisonBars({
  data,
  emptyMessage,
  valueSuffix = "",
}: {
  data: Array<{ label: string; value: number; sublabel?: string }>;
  emptyMessage: string;
  valueSuffix?: string;
}) {
  if (data.length === 0 || data.every((d) => d.value === 0)) return <EmptyPlot message={emptyMessage} />;
  const max = Math.max(1, ...data.map((d) => d.value));

  return (
    <ul className="space-y-3">
      {data.map((d) => (
        <li key={d.label}>
          <div className="flex items-baseline justify-between gap-2 mb-1">
            <span className="text-xs text-slate-200 truncate">
              {d.label}
              {d.sublabel && <span className="text-slate-500 ml-1.5">{d.sublabel}</span>}
            </span>
            <span className="text-xs font-mono text-slate-300 tabular-nums shrink-0">
              {d.value}
              {valueSuffix}
            </span>
          </div>
          <div className="h-2 bg-white/[0.04] rounded-full overflow-hidden">
            <div className="h-full rounded-full" style={{ width: `${Math.max(1.5, (d.value / max) * 100)}%`, background: SERIES }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// Success / failure split — status colours, never the series hue
// ---------------------------------------------------------------------------

export function OutcomeSplit({ completed, failed }: { completed: number; failed: number }) {
  const total = completed + failed;
  if (total === 0) return <EmptyPlot message="No completed calls yet." />;

  return (
    <div>
      <div className="flex h-3 rounded-full overflow-hidden gap-[2px]" role="img" aria-label={`${completed} completed, ${failed} failed`}>
        <div style={{ width: `${(completed / total) * 100}%`, background: STATUS.good }} className="rounded-l-full" />
        {failed > 0 && <div style={{ width: `${(failed / total) * 100}%`, background: STATUS.critical }} className="rounded-r-full" />}
      </div>
      {/* Status never travels on colour alone — each swatch carries its label. */}
      <div className="flex gap-4 mt-2.5 text-[11px]">
        <span className="flex items-center gap-1.5 text-slate-300">
          <span className="h-2 w-2 rounded-full" style={{ background: STATUS.good }} aria-hidden="true" />
          Completed <span className="font-mono tabular-nums text-slate-200">{completed}</span>
        </span>
        <span className="flex items-center gap-1.5 text-slate-300">
          <span className="h-2 w-2 rounded-full" style={{ background: STATUS.critical }} aria-hidden="true" />
          Failed <span className="font-mono tabular-nums text-slate-200">{failed}</span>
        </span>
      </div>
    </div>
  );
}

function EmptyPlot({ message }: { message: string }) {
  return (
    <div className="h-24 flex items-center justify-center text-xs text-slate-500 bg-white/[0.02] rounded-xl border border-white/[0.05]">
      {message}
    </div>
  );
}

export { AXIS };
