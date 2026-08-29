"use client";

import React, { createContext, useCallback, useContext, useMemo, useState } from "react";

/**
 * Shared open/closed state for the mobile navigation drawer.
 *
 * The hamburger lives in the header and the drawer is the sidebar — two
 * sibling components that must agree on one boolean. A tiny context is the
 * least-invasive way to share it without hoisting state into the server-
 * rendered layout or prop-drilling through unrelated components.
 *
 * On desktop the sidebar is always visible and this state is simply ignored,
 * so nothing about the existing desktop layout depends on it.
 */
interface SidebarDrawerValue {
  open: boolean;
  openDrawer: () => void;
  closeDrawer: () => void;
}

const SidebarDrawerContext = createContext<SidebarDrawerValue | null>(null);

export function SidebarDrawerProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const openDrawer = useCallback(() => setOpen(true), []);
  const closeDrawer = useCallback(() => setOpen(false), []);
  const value = useMemo(() => ({ open, openDrawer, closeDrawer }), [open, openDrawer, closeDrawer]);
  return <SidebarDrawerContext.Provider value={value}>{children}</SidebarDrawerContext.Provider>;
}

/** Never throws when used outside the provider — a component that renders in
 * both the drawer layout and elsewhere gets a harmless no-op instead. */
export function useSidebarDrawer(): SidebarDrawerValue {
  return (
    useContext(SidebarDrawerContext) ?? {
      open: false,
      openDrawer: () => undefined,
      closeDrawer: () => undefined,
    }
  );
}
