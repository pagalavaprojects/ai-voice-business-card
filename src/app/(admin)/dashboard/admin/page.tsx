import { redirect } from "next/navigation";
import { AdminDashboard } from "@/features/dashboard/components/AdminDashboard";
import { resolveScopeForPage } from "@/features/dashboard/lib/pageScope";

export const dynamic = "force-dynamic";

/**
 * The explicit admin URL. Typing it as a non-admin must not work, so the
 * check runs HERE on the server rather than relying on the entry point
 * having routed correctly — a non-admin is sent to their own dashboard,
 * which is the safe destination and reveals nothing about what admin data
 * exists.
 */
export default async function AdminDashboardPage() {
  const scope = await resolveScopeForPage();
  if (!scope) redirect("/login");
  if (!scope.isPlatformAdmin) redirect("/dashboard/user");
  return <AdminDashboard />;
}
