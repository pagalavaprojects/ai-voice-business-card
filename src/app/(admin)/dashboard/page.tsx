import { redirect } from "next/navigation";
import { AdminDashboard } from "@/features/dashboard/components/AdminDashboard";
import { UserDashboard } from "@/features/dashboard/components/UserDashboard";
import { resolveScopeForPage } from "@/features/dashboard/lib/pageScope";
import { UnlinkedAccountNotice } from "@/features/dashboard/components/UnlinkedAccountNotice";
import { dashboardExperienceFor } from "@/shared/lib/dashboardScope";

export const dynamic = "force-dynamic";

/**
 * The role-aware dashboard entry point.
 *
 * The SERVER decides which experience renders — a platform admin gets the
 * platform control centre, everyone else gets their own company's dashboard.
 * Rendering directly (rather than redirecting to /dashboard/admin or
 * /dashboard/user) keeps one canonical URL and removes any possibility of a
 * redirect loop.
 *
 * This decision is presentation only: it selects a component. Neither
 * component can reach data its identity is not entitled to, because both
 * talk to endpoints that enforce the same rules again server-side. Hiding a
 * section is never the protection here.
 */
export default async function DashboardPage() {
  const scope = await resolveScopeForPage();
  if (!scope) redirect("/login");

  switch (dashboardExperienceFor(scope)) {
    case "platform":
      return <AdminDashboard />;
    case "company":
      return <UserDashboard />;
    default:
      // Authenticated, but not a member of any company yet — a new sign-up.
      return <UnlinkedAccountNotice email={scope.user.email} />;
  }
}
