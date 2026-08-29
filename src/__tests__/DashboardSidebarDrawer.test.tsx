/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { Sidebar } from "@/features/dashboard/components/Sidebar";
import { WorkspaceHeader } from "@/features/dashboard/components/WorkspaceHeader";
import { SidebarDrawerProvider } from "@/features/dashboard/components/SidebarDrawerContext";

/**
 * The mobile navigation drawer.
 *
 * On a phone the persistent sidebar was eating half the viewport and pushing
 * the dashboard off-screen. The fix turns it into a drawer: hidden by
 * default, opened from a hamburger in the header, dismissed by the backdrop,
 * the close button, Escape, or navigating — and, crucially, closed the moment
 * the route changes so the page you tapped to reach is not hidden behind the
 * menu you tapped it in.
 *
 * Desktop is untouched: `md:translate-x-0` keeps the panel statically
 * visible, so these tests only concern the mobile open/closed lifecycle.
 */

let pathname = "/dashboard";
jest.mock("next/navigation", () => ({
  usePathname: () => pathname,
}));

jest.mock("@/features/dashboard/context/CompanyContext", () => ({
  useCompany: () => ({
    loading: false,
    error: null,
    user: { full_name: "Srinivasan Kandasamy", email: "user@maylaanai.com" },
    memberships: [{ company_id: "c1", role: "EMPLOYEE", company: { name: "Pagalava" } }],
    activeCompanyId: "c1",
    activeMembership: { company_id: "c1", role: "EMPLOYEE", company: { name: "Pagalava" } },
    setActiveCompanyId: jest.fn(),
  }),
}));

jest.mock("@/features/dashboard/components/GlobalSearch", () => ({ GlobalSearch: () => null }));
jest.mock("@/features/auth/components/SignOutButton", () => ({ SignOutButton: () => null }));

function renderShell() {
  return render(
    <SidebarDrawerProvider>
      <WorkspaceHeader />
      <Sidebar />
    </SidebarDrawerProvider>
  );
}

const drawer = () => screen.getByRole("navigation", { name: /dashboard/i });

beforeEach(() => {
  pathname = "/dashboard";
  document.body.style.overflow = "";
});

describe("the drawer starts closed on mobile", () => {
  it("renders the panel translated off-screen and the backdrop non-interactive", () => {
    renderShell();
    expect(drawer().className).toContain("-translate-x-full");
    expect(screen.getByTestId("sidebar-backdrop").className).toContain("pointer-events-none");
    // The hamburger is the only way in.
    expect(screen.getByTestId("sidebar-open")).toBeInTheDocument();
  });

  it("does not lock body scroll while closed", () => {
    renderShell();
    expect(document.body.style.overflow).not.toBe("hidden");
  });
});

describe("opening and closing", () => {
  it("opens from the hamburger, slides in, and locks body scroll", () => {
    renderShell();
    act(() => {
      fireEvent.click(screen.getByTestId("sidebar-open"));
    });
    expect(drawer().className).toContain("translate-x-0");
    expect(drawer().className).not.toContain("-translate-x-full");
    expect(document.body.style.overflow).toBe("hidden");
  });

  it("closes from the close button and restores body scroll", () => {
    renderShell();
    act(() => fireEvent.click(screen.getByTestId("sidebar-open")));
    act(() => fireEvent.click(screen.getByTestId("sidebar-close")));
    expect(drawer().className).toContain("-translate-x-full");
    expect(document.body.style.overflow).not.toBe("hidden");
  });

  it("closes when the backdrop is tapped", () => {
    renderShell();
    act(() => fireEvent.click(screen.getByTestId("sidebar-open")));
    act(() => fireEvent.click(screen.getByTestId("sidebar-backdrop")));
    expect(drawer().className).toContain("-translate-x-full");
  });

  it("closes on Escape", () => {
    renderShell();
    act(() => fireEvent.click(screen.getByTestId("sidebar-open")));
    act(() => {
      fireEvent.keyDown(document, { key: "Escape" });
    });
    expect(drawer().className).toContain("-translate-x-full");
  });

  it("moves focus to the close button when opened", () => {
    renderShell();
    act(() => fireEvent.click(screen.getByTestId("sidebar-open")));
    expect(screen.getByTestId("sidebar-close")).toHaveFocus();
  });
});

describe("navigating dismisses the drawer", () => {
  it("closes when the route changes", () => {
    const { rerender } = renderShell();
    act(() => fireEvent.click(screen.getByTestId("sidebar-open")));
    expect(drawer().className).toContain("translate-x-0");

    // A nav link was tapped; the app router changes the path.
    pathname = "/dashboard/leads";
    act(() => {
      rerender(
        <SidebarDrawerProvider>
          <WorkspaceHeader />
          <Sidebar />
        </SidebarDrawerProvider>
      );
    });
    expect(drawer().className).toContain("-translate-x-full");
  });
});
