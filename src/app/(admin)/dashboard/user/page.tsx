import { redirect } from "next/navigation";
import { UserDashboard } from "@/features/dashboard/components/UserDashboard";
import { resolveScopeForPage } from "@/features/dashboard/lib/pageScope";

export const dynamic = "force-dynamic";

/**
 * The explicit user URL. Open to any authenticated member — including a
 * platform admin, who may legitimately want to see a tenant-shaped view.
 * The data itself is still scoped by the session on the server, so this
 * page cannot show one tenant another's rows regardless of who opens it.
 */
export default async function UserDashboardPage() {
  const scope = await resolveScopeForPage();
  if (!scope) redirect("/login");
  return <UserDashboard />;
}
