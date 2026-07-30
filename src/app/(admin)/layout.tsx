import React from "react";
import { Sidebar } from "@/features/dashboard/components/Sidebar";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-[#090d16] text-slate-100 antialiased">
      {/* Sidebar Navigation */}
      <Sidebar />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        <header className="h-16 border-b border-white/[0.08] bg-[#0c111d]/50 backdrop-blur-md px-6 flex items-center justify-between sticky top-0 z-20">
          <h1 className="text-sm font-semibold text-slate-300">Admin Workspace / Acme Autonomous Corp</h1>
          <div className="flex items-center gap-3">
            <span className="text-xs font-mono px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              ● System Active
            </span>
          </div>
        </header>

        <main className="p-6 sm:p-8 flex-1">{children}</main>
      </div>
    </div>
  );
}
