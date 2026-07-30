"use client";

import React, { useMemo } from "react";
import { diffLines } from "diff";

/** Real line-level diff (not a side-by-side approximation) between a
 * previous version's content and the current content, using the `diff`
 * package's Myers-diff implementation. */
export function PromptDiff({ before, after }: { before: string; after: string }) {
  const parts = useMemo(() => diffLines(before, after), [before, after]);

  if (before === after) {
    return <p className="text-xs text-slate-500">No differences between these two versions.</p>;
  }

  return (
    <pre className="whitespace-pre-wrap text-xs font-mono leading-relaxed bg-slate-900/60 border border-white/[0.06] rounded-lg p-3 max-h-[50vh] overflow-y-auto">
      {parts.map((part, i) => (
        <span
          key={i}
          className={
            part.added
              ? "block bg-emerald-500/15 text-emerald-300"
              : part.removed
              ? "block bg-rose-500/15 text-rose-300 line-through decoration-rose-500/40"
              : "block text-slate-400"
          }
        >
          {part.value
            .replace(/\n$/, "")
            .split("\n")
            .map((line, li) => (
              <span key={li} className="block">
                <span className="select-none mr-2 text-slate-600">{part.added ? "+" : part.removed ? "-" : " "}</span>
                {line}
              </span>
            ))}
        </span>
      ))}
    </pre>
  );
}
