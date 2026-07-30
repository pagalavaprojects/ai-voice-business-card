"use client";

import React, { useEffect, useRef, useState } from "react";
import { Search, User, Bot, FileText, Calendar, UserCircle, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCompany } from "@/features/dashboard/context/CompanyContext";
import { apiFetch } from "@/shared/lib/apiClient";
import type { GlobalSearchResult } from "@/app/api/admin/search/route";

const TYPE_ICON: Record<GlobalSearchResult["type"], React.ElementType> = {
  lead: User,
  agent: Bot,
  knowledge: FileText,
  appointment: Calendar,
  employee: UserCircle,
};

export function GlobalSearch() {
  const { activeCompanyId } = useCompany();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GlobalSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!activeCompanyId || query.trim().length < 2) {
      setResults([]);
      return;
    }
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const data = await apiFetch<GlobalSearchResult[]>(
          `/api/admin/search?companyId=${activeCompanyId}&q=${encodeURIComponent(query)}`
        );
        setResults(data);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [query, activeCompanyId]);

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const select = (result: GlobalSearchResult) => {
    setOpen(false);
    setQuery("");
    router.push(result.href);
  };

  return (
    <div ref={containerRef} className="relative w-full max-w-xs">
      <label htmlFor="global-search" className="sr-only">
        Search leads, agents, knowledge, appointments, employees
      </label>
      <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-slate-500" />
      <input
        id="global-search"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder="Search everything…"
        className="w-full rounded-lg bg-slate-900/60 border border-white/[0.08] pl-8 pr-3 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500"
      />
      {open && query.trim().length >= 2 && (
        <div className="absolute top-full mt-1 w-80 max-h-96 overflow-y-auto rounded-xl border border-white/[0.08] bg-[#0c111d] shadow-2xl z-30">
          {loading ? (
            <div className="p-3 text-xs text-slate-500">
              <Loader2 className="h-3.5 w-3.5 animate-spin inline mr-2" />
              Searching…
            </div>
          ) : results.length === 0 ? (
            <div className="p-3 text-xs text-slate-500">No results for &ldquo;{query}&rdquo;</div>
          ) : (
            <ul>
              {results.map((r) => {
                const Icon = TYPE_ICON[r.type];
                return (
                  <li key={`${r.type}-${r.id}`}>
                    <button
                      onClick={() => select(r)}
                      className="w-full flex items-center gap-2 px-3 py-2 text-left text-xs hover:bg-white/[0.04] focus-visible:outline-none focus-visible:bg-white/[0.06]"
                    >
                      <Icon className="h-3.5 w-3.5 text-sky-400 shrink-0" />
                      <div className="min-w-0">
                        <div className="text-slate-200 truncate">{r.title}</div>
                        <div className="text-slate-500 truncate">
                          {r.type} • {r.subtitle}
                        </div>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
