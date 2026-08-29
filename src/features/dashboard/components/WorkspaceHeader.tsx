"use client";

import React from "react";
import { ChevronDown, Menu } from "lucide-react";
import { useCompany } from "@/features/dashboard/context/CompanyContext";
import { GlobalSearch } from "@/features/dashboard/components/GlobalSearch";
import { SignOutButton } from "@/features/auth/components/SignOutButton";
import { useSidebarDrawer } from "@/features/dashboard/components/SidebarDrawerContext";

export function WorkspaceHeader() {
  const { loading, error, user, memberships, activeCompanyId, activeMembership, setActiveCompanyId } = useCompany();
  const { openDrawer } = useSidebarDrawer();

  return (
    <header className="h-16 border-b border-white/[0.08] bg-[#0c111d]/50 backdrop-blur-md px-4 sm:px-6 flex items-center justify-between sticky top-0 z-20">
      <div className="flex items-center gap-2 min-w-0">
        {/* Opens the navigation drawer — mobile only; the sidebar is always
            visible from md up. */}
        <button
          type="button"
          onClick={openDrawer}
          aria-label="Open menu"
          aria-controls="dashboard-sidebar"
          data-testid="sidebar-open"
          className="md:hidden -ml-1 mr-1 h-9 w-9 shrink-0 flex items-center justify-center rounded-lg text-slate-300 hover:text-slate-100 hover:bg-white/[0.06] focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
        >
          <Menu className="h-5 w-5" aria-hidden="true" />
        </button>
        {loading ? (
          <span className="text-sm text-slate-500">Loading workspace…</span>
        ) : error ? (
          <span className="text-sm text-rose-400" role="alert">
            {error}
          </span>
        ) : memberships.length === 0 ? (
          <span className="text-sm text-slate-400">No company memberships yet</span>
        ) : (
          <div className="relative">
            <label htmlFor="company-switcher" className="sr-only">
              Active company
            </label>
            <select
              id="company-switcher"
              value={activeCompanyId ?? ""}
              onChange={(e) => setActiveCompanyId(e.target.value)}
              className="appearance-none bg-transparent text-sm font-semibold text-slate-200 pr-6 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 rounded cursor-pointer"
            >
              {memberships.map((m) => (
                <option key={m.company_id} value={m.company_id} className="bg-[#0c111d]">
                  {m.company?.name || m.company_id} — {m.role}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-0 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500" />
          </div>
        )}
      </div>

      <div className="flex-1 flex justify-center px-4 hidden md:flex">
        <GlobalSearch />
      </div>

      <div className="flex items-center gap-3 shrink-0">
        {user && <span className="text-xs text-slate-500 hidden sm:inline">{user.email}</span>}
        <span
          className={`text-xs font-mono px-2.5 py-1 rounded-full border ${
            activeMembership
              ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
              : "bg-slate-500/10 text-slate-400 border-slate-500/20"
          }`}
        >
          ● {activeMembership ? "System Active" : "No Access"}
        </span>
        <SignOutButton />
      </div>
    </header>
  );
}
