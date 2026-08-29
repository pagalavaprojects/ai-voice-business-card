import React from "react";
import { Sidebar } from "@/features/dashboard/components/Sidebar";
import { CompanyProvider } from "@/features/dashboard/context/CompanyContext";
import { WorkspaceHeader } from "@/features/dashboard/components/WorkspaceHeader";
import { SidebarDrawerProvider } from "@/features/dashboard/components/SidebarDrawerContext";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <CompanyProvider>
      <SidebarDrawerProvider>
        {/* min-w-0 on the content column + overflow-x-hidden on the shell keep
            a wide table or chart from forcing the whole page to scroll
            sideways on a phone. */}
        <div className="flex min-h-screen bg-[var(--surface-0)] text-slate-100 antialiased overflow-x-hidden">
          <Sidebar />

          <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
            <WorkspaceHeader />
            <main id="main-content" className="p-4 sm:p-8 flex-1 min-w-0">{children}</main>
          </div>
        </div>
      </SidebarDrawerProvider>
    </CompanyProvider>
  );
}
