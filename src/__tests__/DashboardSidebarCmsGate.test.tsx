/**
 * @jest-environment jsdom
 *
 * The Enterprise CMS pages (/dashboard/cms/*) are separate, not-yet-shipped
 * work — in production those routes 404. The sidebar must not advertise a
 * link that dead-ends: the CMS entries stay hidden until the deployment that
 * ships the pages sets NEXT_PUBLIC_CMS_ENABLED=true. Found live on
 * 2026-09-08: five sidebar links returned 404.
 */
jest.mock("next/navigation", () => ({ usePathname: () => "/dashboard" }));
jest.mock("@/features/dashboard/context/CompanyContext", () => ({
  useCompany: () => ({
    loading: false,
    error: null,
    user: { full_name: "Srinivasan Kandasamy", email: "user@maylaanai.com" },
    memberships: [{ company_id: "c1", role: "OWNER", company: { name: "Pagalava" } }],
    activeCompanyId: "c1",
    activeMembership: { company_id: "c1", role: "OWNER", company: { name: "Pagalava" } },
    setActiveCompanyId: jest.fn(),
  }),
}));
jest.mock("@/features/auth/components/SignOutButton", () => ({ SignOutButton: () => null }));

const CMS_HREFS = ["/dashboard/cms/profile", "/dashboard/cms/offices", "/dashboard/cms/solutions", "/dashboard/cms/media", "/dashboard/cms/seo"];
const SHIPPED_HREFS = ["/dashboard", "/dashboard/analytics", "/dashboard/listening", "/dashboard/leads", "/dashboard/appointments", "/dashboard/settings"];

/** The gate is read at module load, so each case renders from a fresh module
 * registry — React, react-dom and the Sidebar loaded together inside it so
 * hooks resolve against one React instance (react-dom/client is used
 * directly: the testing library registers lifecycle hooks on import, which
 * is not allowed inside a test). Returns the hrefs of every rendered link. */
function navHrefsWith(env: string | undefined): string[] {
  if (env === undefined) delete process.env.NEXT_PUBLIC_CMS_ENABLED;
  else process.env.NEXT_PUBLIC_CMS_ENABLED = env;
  let hrefs: string[] = [];
  jest.isolateModules(() => {
    const React = require("react");
    const { createRoot } = require("react-dom/client");
    const { act } = require("react-dom/test-utils");
    const { Sidebar } = require("@/features/dashboard/components/Sidebar");
    const { SidebarDrawerProvider } = require("@/features/dashboard/components/SidebarDrawerContext");
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => {
      root.render(React.createElement(SidebarDrawerProvider, null, React.createElement(Sidebar)));
    });
    hrefs = [...container.querySelectorAll("a[href]")].map((a) => a.getAttribute("href") ?? "");
    act(() => {
      root.unmount();
    });
    container.remove();
  });
  return hrefs;
}

afterEach(() => {
  delete process.env.NEXT_PUBLIC_CMS_ENABLED;
});

describe("sidebar CMS links are gated on the CMS actually being shipped", () => {
  it("hides every /dashboard/cms/* link by default and keeps the shipped pages", () => {
    const links = navHrefsWith(undefined);
    for (const h of CMS_HREFS) expect(links).not.toContain(h);
    for (const h of SHIPPED_HREFS) expect(links).toContain(h);
  });

  it("treats anything but the literal 'true' as off", () => {
    const links = navHrefsWith("1");
    for (const h of CMS_HREFS) expect(links).not.toContain(h);
  });

  it("shows the CMS links once NEXT_PUBLIC_CMS_ENABLED=true", () => {
    const links = navHrefsWith("true");
    for (const h of CMS_HREFS) expect(links).toContain(h);
    for (const h of SHIPPED_HREFS) expect(links).toContain(h);
  });
});
