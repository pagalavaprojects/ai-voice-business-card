/**
 * @jest-environment jsdom
 *
 * Requirement 14 asks for the listening analytics per user AND in aggregate.
 * The aggregate view is what the business owner reads, and an owner /
 * platform admin lands on AdminDashboard — which, until 2026-09-08, did not
 * compose the section at all (only the staff-facing UserDashboard did, so
 * the OWNER session on production never saw it). This pins the composition
 * on both experiences.
 */
import "@testing-library/jest-dom";
import React from "react";
import { render, screen } from "@testing-library/react";

jest.mock("@/features/dashboard/context/CompanyContext", () => ({
  useCompany: () => ({
    loading: false,
    error: null,
    activeCompanyId: "c1",
    user: { full_name: "Owner", email: "owner@maylaanai.com" },
    memberships: [{ company_id: "c1", role: "OWNER", company: { name: "Pagalava" } }],
    activeMembership: { company_id: "c1", role: "OWNER", company: { name: "Pagalava" } },
    setActiveCompanyId: jest.fn(),
  }),
}));
jest.mock("@/shared/ui/toast", () => ({ useToast: () => ({ showToast: jest.fn() }) }));
// The operational live poll is out of scope here: keep it in its loading state.
jest.mock("@/features/dashboard/hooks/useLivePoll", () => ({
  useLivePoll: () => ({ data: null, status: "loading", lastUpdatedAt: null, error: null, refresh: jest.fn() }),
}));
// The platform overview request fails like it does for a non-platform-admin (403).
jest.mock("@/shared/lib/apiClient", () => ({ apiFetch: jest.fn(async () => Promise.reject(new Error("403"))) }));
jest.mock("@/features/dashboard/components/ListeningAnalytics", () => ({
  ListeningAnalytics: () => <section data-testid="listening-analytics-stub">listening analytics</section>,
}));

import fs from "fs";
import path from "path";
import { AdminDashboard } from "@/features/dashboard/components/AdminDashboard";

describe("card listening analytics is composed on BOTH dashboard experiences", () => {
  it("renders the section on the owner/admin dashboard even while the live poll is still loading", async () => {
    render(<AdminDashboard />);
    expect(await screen.findByTestId("listening-analytics-stub")).toBeInTheDocument();
  });

  it("the staff dashboard keeps composing it (source guard — its page only mounts once its own poll has data)", () => {
    const src = fs.readFileSync(path.join(process.cwd(), "src/features/dashboard/components/UserDashboard.tsx"), "utf8");
    expect(src).toMatch(/import \{ ListeningAnalytics \} from "@\/features\/dashboard\/components\/ListeningAnalytics"/);
    expect(src).toMatch(/<ListeningAnalytics \/>/);
  });
});
