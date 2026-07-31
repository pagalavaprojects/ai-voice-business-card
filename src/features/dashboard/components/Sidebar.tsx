"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  BookOpen,
  FileCode,
  Calendar,
  Settings,
  Bot,
} from "lucide-react";
import { cn } from "@/shared/ui/button";
import { useCompany } from "@/features/dashboard/context/CompanyContext";

const navItems = [
  { label: "Overview", href: "/dashboard", icon: LayoutDashboard },
  { label: "Leads", href: "/dashboard/leads", icon: Users },
  { label: "Knowledge Base", href: "/dashboard/knowledge", icon: BookOpen },
  { label: "Prompt Editor", href: "/dashboard/prompts", icon: FileCode },
  { label: "Appointments", href: "/dashboard/appointments", icon: Calendar },
  { label: "Settings", href: "/dashboard/settings", icon: Settings },
];

export const Sidebar: React.FC = () => {
  const pathname = usePathname();
  const { user } = useCompany();

  const displayName = user?.full_name?.trim() || user?.email?.split("@")[0] || "Not signed in";
  const initials =
    displayName
      .split(/[\s._-]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part: string) => part[0]?.toUpperCase())
      .join("") || "?";

  return (
    <aside className="w-64 bg-[#0c111d] border-r border-white/[0.08] flex flex-col justify-between p-4 min-h-screen">
      <div className="space-y-6">
        {/* Brand Header */}
        <div className="flex items-center gap-3 px-2 pt-2">
          <div className="h-9 w-9 rounded-xl bg-gradient-to-tr from-sky-500 to-indigo-500 flex items-center justify-center text-white shadow-lg shadow-sky-500/30">
            <Bot className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-100 tracking-tight">VoiceCard AI</h2>
            <p className="text-[10px] text-sky-400 font-mono">Enterprise SaaS</p>
          </div>
        </div>

        {/* Navigation Items */}
        <nav className="space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all",
                  isActive
                    ? "bg-sky-500/10 text-sky-400 border border-sky-500/20 shadow-sm"
                    : "text-slate-400 hover:text-slate-100 hover:bg-white/[0.04]"
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Footer User Profile — the real signed-in user, not a hardcoded one */}
      <div className="border-t border-white/[0.08] pt-4 px-2 flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <div className="h-8 w-8 shrink-0 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-xs font-bold text-sky-400">
            {initials}
          </div>
          <div className="text-xs min-w-0">
            <p className="font-semibold text-slate-200 truncate">{displayName}</p>
            <p className="text-[10px] text-slate-400 truncate">{user?.email || "Not signed in"}</p>
          </div>
        </div>
      </div>
    </aside>
  );
};
