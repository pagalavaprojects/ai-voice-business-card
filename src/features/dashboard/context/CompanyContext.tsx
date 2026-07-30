"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Company, CompanyMember, UserProfile } from "@/core/domain/models/types";

interface Membership extends CompanyMember {
  company: Company;
}

interface CompanyContextValue {
  loading: boolean;
  error: string | null;
  user: UserProfile | null;
  memberships: Membership[];
  activeCompanyId: string | null;
  activeMembership: Membership | null;
  setActiveCompanyId: (id: string) => void;
  refresh: () => Promise<void>;
}

const CompanyContext = createContext<CompanyContextValue | null>(null);

const STORAGE_KEY = "voicecard.activeCompanyId";

export function CompanyProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [activeCompanyId, setActiveCompanyIdState] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/me");
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.message || "Failed to load session");
      }
      setUser(json.data.user);
      setMemberships(json.data.memberships);

      const stored = typeof window !== "undefined" ? window.localStorage.getItem(STORAGE_KEY) : null;
      const validStored = stored && json.data.memberships.some((m: Membership) => m.company_id === stored);
      const fallback = json.data.memberships[0]?.company_id ?? null;
      setActiveCompanyIdState(validStored ? stored : fallback);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load session");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const setActiveCompanyId = useCallback((id: string) => {
    setActiveCompanyIdState(id);
    if (typeof window !== "undefined") window.localStorage.setItem(STORAGE_KEY, id);
  }, []);

  const activeMembership = useMemo(
    () => memberships.find((m) => m.company_id === activeCompanyId) ?? null,
    [memberships, activeCompanyId]
  );

  const value: CompanyContextValue = {
    loading,
    error,
    user,
    memberships,
    activeCompanyId,
    activeMembership,
    setActiveCompanyId,
    refresh: load,
  };

  return <CompanyContext.Provider value={value}>{children}</CompanyContext.Provider>;
}

export function useCompany(): CompanyContextValue {
  const ctx = useContext(CompanyContext);
  if (!ctx) throw new Error("useCompany must be used within a CompanyProvider");
  return ctx;
}
