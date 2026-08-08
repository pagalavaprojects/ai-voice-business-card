import React from "react";
import { Sidebar } from "@/features/dashboard/components/Sidebar";
import { CompanyProvider } from "@/features/dashboard/context/CompanyContext";
import { WorkspaceHeader } from "@/features/dashboard/components/WorkspaceHeader";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <CompanyProvider>
      <div className="flex min-h-screen bg-[#090d16] text-slate-100 antialiased">
        <Sidebar />

        <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
          <WorkspaceHeader />
          <main id="main-content" className="p-6 sm:p-8 flex-1">{children}</main>
        </div>
      </div>
    </CompanyProvider>
  );
}
