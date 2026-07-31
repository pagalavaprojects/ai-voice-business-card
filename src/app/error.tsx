"use client";

import { useEffect } from "react";

/** App Router error boundary for unexpected runtime failures.
 *
 * Deliberately does not render `error.message`: it can contain internal
 * details (query fragments, upstream provider errors) that shouldn't reach a
 * visitor. The digest is shown instead — it's the stable id Next assigns, so
 * a user can quote it and it can be matched against server logs. */
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("Unhandled application error:", error);
  }, [error]);

  return (
    <main className="min-h-screen bg-[#090d16] text-slate-100 flex items-center justify-center p-6">
      <div className="max-w-sm text-center space-y-4">
        <p className="font-mono text-xs uppercase tracking-widest text-amber-400">Error</p>
        <h1 className="text-xl font-bold">Something went wrong</h1>
        <p className="text-sm text-slate-400">
          This page failed to load. Trying again often resolves it.
        </p>
        {error.digest && <p className="font-mono text-[11px] text-slate-500">Reference: {error.digest}</p>}
        <button
          onClick={reset}
          className="inline-block rounded-lg bg-sky-600 px-4 py-2 text-xs font-semibold text-white hover:bg-sky-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
        >
          Try again
        </button>
      </div>
    </main>
  );
}
