"use client";

import React, { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { X } from "lucide-react";
import {
  LayoutDashboard,
  Users,
  BookOpen,
  FileCode,
  Calendar,
  Settings,
  Bot,
  BarChart3,
  Package,
  Wrench,
  IdCard,
  Globe,
  Building2,
  FileImage,
  Search,
  MessageSquareQuote,
  HelpCircle,
  Newspaper,
  Palette,
  Layers,
} from "lucide-react";
import { cn } from "@/shared/ui/button";
import { useCompany } from "@/features/dashboard/context/CompanyContext";
import { useSidebarDrawer } from "@/features/dashboard/components/SidebarDrawerContext";

const navItems = [
  { label: "Overview", href: "/dashboard", icon: LayoutDashboard },
  { label: "Analytics", href: "/dashboard/analytics", icon: BarChart3 },
  { label: "Leads", href: "/dashboard/leads", icon: Users },
  { label: "AI Agents", href: "/dashboard/agents", icon: Bot },
  { label: "Employees", href: "/dashboard/employees", icon: IdCard },
  { label: "Products", href: "/dashboard/products", icon: Package },
  { label: "Services", href: "/dashboard/services", icon: Wrench },
  { label: "CMS Profile", href: "/dashboard/cms/profile", icon: Building2 },
  { label: "CMS Offices", href: "/dashboard/cms/offices", icon: Globe },
  { label: "CMS AI Solutions", href: "/dashboard/cms/solutions", icon: Layers },
  { label: "Media Library", href: "/dashboard/cms/media", icon: FileImage },
  { label: "SEO Manager", href: "/dashboard/cms/seo", icon: Search },
  { label: "Knowledge Base", href: "/dashboard/knowledge", icon: BookOpen },
  { label: "Prompt Editor", href: "/dashboard/prompts", icon: FileCode },
  { label: "Appointments", href: "/dashboard/appointments", icon: Calendar },
  { label: "Settings", href: "/dashboard/settings", icon: Settings },
];

export const Sidebar: React.FC = () => {
  const pathname = usePathname();
  const { user } = useCompany();
  const { open, closeDrawer } = useSidebarDrawer();
  const asideRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  // Close the drawer whenever the route changes — a tapped nav link both
  // navigates AND dismisses, so the freshly opened page is not hidden behind
  // the menu the visitor just used.
  useEffect(() => {
    closeDrawer();
    // Intentionally only on pathname change, not on closeDrawer identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // While the drawer is open on mobile: lock body scroll, close on Escape,
  // move focus into the panel, and keep Tab inside it. All of this is inert
  // on desktop, where `open` stays false and the panel is statically visible.
  useEffect(() => {
    if (!open) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        closeDrawer();
        return;
      }
      if (e.key !== "Tab") return;
      const focusables = asideRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (!focusables || focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = originalOverflow;
      previouslyFocused?.focus();
    };
  }, [open, closeDrawer]);

  const displayName = user?.full_name?.trim() || user?.email?.split("@")[0] || "Not signed in";
  const initials =
    displayName
      .split(/[\s._-]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part: string) => part[0]?.toUpperCase())
      .join("") || "?";

  return (
    <>
      {/* Backdrop — mobile only, and only while the drawer is open. A tap
          anywhere on it dismisses the menu. */}
      <div
        className={cn(
          "fixed inset-0 z-30 bg-black/60 backdrop-blur-sm transition-opacity md:hidden",
          open ? "opacity-100" : "pointer-events-none opacity-0"
        )}
        aria-hidden="true"
        data-testid="sidebar-backdrop"
        onClick={closeDrawer}
      />

      {/* On desktop the panel is a static column in the flex row. On mobile it
          is fixed and slid off-screen (-translate-x-full) until opened, so it
          never occupies layout width and the main content is full-bleed. */}
      <aside
        ref={asideRef}
        id="dashboard-sidebar"
        role="navigation"
        aria-label="Dashboard"
        aria-hidden={!open ? undefined : undefined}
        className={cn(
          "fixed inset-y-0 left-0 z-40 w-64 bg-[#0c111d] border-r border-white/[0.08] flex flex-col justify-between p-4 min-h-screen transition-transform duration-200 ease-out",
          "md:static md:z-auto md:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full"
        )}
      >
      <div className="space-y-6">
        {/* Brand Header — the close button sits here on mobile only. */}
        <div className="flex items-center justify-between gap-3 px-2 pt-2">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-tr from-sky-500 to-indigo-500 flex items-center justify-center text-white shadow-lg shadow-sky-500/30">
              <Bot className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-100 tracking-tight">Maylaan AI</h2>
              <p className="text-[10px] text-sky-400 font-mono">Enterprise SaaS</p>
            </div>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={closeDrawer}
            aria-label="Close menu"
            data-testid="sidebar-close"
            className="md:hidden h-9 w-9 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-100 hover:bg-white/[0.06] focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
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
    </>
  );
};
