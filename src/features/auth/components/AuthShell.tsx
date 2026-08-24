"use client";

import React from "react";
import Link from "next/link";
import { Bot } from "lucide-react";
import { Card } from "@/shared/ui/card";

/**
 * The shared frame for every authentication page, so Login, Sign Up, Forgot
 * Password and Reset Password are visibly one product rather than four
 * separate forms. Matches the existing card/glass treatment used across the
 * dashboard instead of introducing a second visual language.
 */
export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <main id="main-content" className="min-h-screen bg-[var(--surface-0)] flex items-center justify-center p-4">
      {/* Decorative only — hidden from assistive technology. */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[500px] h-[500px] bg-sky-500/8 blur-[150px] rounded-full" />
      </div>

      <div className="relative z-10 w-full max-w-sm space-y-6">
        <div className="text-center space-y-2">
          <div className="h-14 w-14 rounded-2xl bg-gradient-to-tr from-sky-500 to-indigo-500 flex items-center justify-center mx-auto shadow-xl shadow-sky-500/30">
            <Bot className="h-7 w-7 text-white" aria-hidden="true" />
          </div>
          <h1 className="text-2xl font-extrabold text-slate-100 tracking-tight">Maylaan AI</h1>
          <p className="text-xs text-slate-400">Your Business Insight, Backed by Deep-Tech</p>
        </div>

        <Card className="glass-panel border-white/[0.08] p-6 rounded-2xl space-y-5">
          <div className="space-y-1">
            <h2 className="text-sm font-bold text-slate-100">{title}</h2>
            {subtitle && <p className="text-[11px] text-slate-400">{subtitle}</p>}
          </div>
          {children}
        </Card>

        {footer && <div className="text-center text-[11px] text-slate-400">{footer}</div>}

        <p className="text-center text-[10px] text-slate-500">© {new Date().getFullYear()} Pagalava Data Analytics</p>
      </div>
    </main>
  );
}

/** One field style for every auth input, so a new page cannot drift. */
export const authInputClass =
  "w-full bg-slate-900 border border-white/10 rounded-xl px-3 py-2.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 transition-colors";

/** An error the visitor caused or must act on. `role="alert"` so a screen
 * reader announces it the moment it appears. */
export function AuthError({ message }: { message: string }) {
  return (
    <div role="alert" className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs">
      {message}
    </div>
  );
}

/** A neutral/positive outcome — deliberately distinct from an error so the
 * generic recovery message is never mistaken for a failure. */
export function AuthNotice({ message }: { message: string }) {
  return (
    <div role="status" className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-200 text-xs">
      {message}
    </div>
  );
}

export function AuthLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="font-semibold text-sky-400 hover:text-sky-300 hover:underline">
      {children}
    </Link>
  );
}
