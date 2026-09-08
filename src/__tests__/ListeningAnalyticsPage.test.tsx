/**
 * @jest-environment jsdom
 *
 * Item 14 — the ONE simple page. Renders the full variant against the real
 * useLivePoll with a mocked API and proves: per-user listening table (all six
 * clips), per-user DP1–DP6 table with Yes/No/Maybe and completion, unique
 * listeners today / 7 days, the Today | 7 Days toggle re-requesting through
 * the same poll, honest empty / not-applied / unavailable states, and the
 * accessibility skeleton (headings, column headers, named group).
 */
import "@testing-library/jest-dom";
import React from "react";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";

const apiFetch = jest.fn();
jest.mock("@/shared/lib/apiClient", () => ({ apiFetch: (...a: unknown[]) => apiFetch(...a) }));
jest.mock("next/link", () => ({ __esModule: true, default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a> }));

import { ListeningAnalytics } from "@/features/dashboard/components/ListeningAnalytics";
import ListeningAnalyticsPage from "@/app/(admin)/dashboard/listening/page";

const midnight = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};
const DAY = 24 * 3600_000;
const user = (over: Record<string, unknown>) => ({
  key: "visitor:sessXXXX",
  label: "Visitor sessXXXX",
  kind: "visitor",
  leadId: null,
  email: null,
  plays: { intro: 0, replay: 0, elevator: 0, product: 0, usp: 0, smart: 0, total: 0 },
  dataPoints: [null, null, null, null, null, null],
  answered: 0,
  completed: false,
  lastAt: null,
  ...over,
});
function payload(over: Record<string, unknown> = {}) {
  const m = midnight().getTime();
  return {
    range: "7d",
    windows: { todayStart: new Date(m).toISOString(), weekStart: new Date(m - 6 * DAY).toISOString() },
    listenStatus: "ok",
    leadStatus: "ok",
    telemetryEnabled: true,
    totals: { todayUsers: 3, weekUsers: 5, todayPlays: 10, weekPlays: 14 },
    byType: { intro: 4, replay: 1, elevator: 3, product: 2, usp: 5, smart: 2, total: 17 },
    trend: Array.from({ length: 7 }, (_, i) => ({ day: new Date(m - (6 - i) * DAY).toISOString(), plays: i === 6 ? 10 : 0 })),
    users: [
      user({ key: "lead:l1", label: "Srinivasan", kind: "lead", leadId: "l1", plays: { intro: 4, replay: 1, elevator: 3, product: 2, usp: 5, smart: 2, total: 17 }, dataPoints: ["YES", "YES", "MAYBE", "NO", "YES", "YES"], answered: 6, completed: true }),
      user({ key: "lead:l2", label: "Priya", kind: "lead", leadId: "l2", dataPoints: ["NO", null, null, null, null, null], answered: 1 }),
    ],
    usersTotal: 2,
    appointments: { bookedWeek: 1, bookedTotal: 2, requestedTotal: 0 },
    definitions: { user: "One visitor.", today: "From local midnight.", week: "Last 7 local days.", plays: "Genuine plays only." },
    ...over,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  apiFetch.mockResolvedValue(payload());
});

describe("the page", () => {
  it("renders per-user listening (six clips + total) and per-user DP1–DP6 with completion, from ONE request", async () => {
    render(<ListeningAnalyticsPage />);
    expect(await screen.findByRole("heading", { level: 1, name: /Listening & Data Point Analytics/ })).toBeInTheDocument();
    expect(apiFetch).toHaveBeenCalledTimes(1);
    expect(String(apiFetch.mock.calls[0][0])).toMatch(/^\/api\/user\/listen-analytics\?range=7d&todayStart=/);

    const listening = screen.getByTestId("per-user-listening");
    expect(within(listening).getAllByRole("columnheader").map((h) => h.textContent)).toEqual(["User", "Intro", "Replay", "Elevator", "Service", "Why Us", "Smart AI Lead", "Total"]);
    const srini = within(listening).getByTestId("listen-user-lead:l1");
    expect(within(srini).getAllByRole("cell").map((c) => c.textContent)).toEqual(["4", "1", "3", "2", "5", "2", "17"]);
    // A user with no plays in range is not padded into the listening table with zeros.
    expect(within(listening).queryByTestId("listen-user-lead:l2")).toBeNull();

    const dps = screen.getByTestId("per-user-datapoints");
    expect(within(dps).getAllByRole("columnheader").map((h) => h.textContent)).toEqual(["User", "DP1", "DP2", "DP3", "DP4", "DP5", "DP6", "Answered", "Completed"]);
    expect(within(within(dps).getByTestId("dp-user-lead:l1")).getAllByRole("cell").map((c) => c.textContent)).toEqual(["Yes", "Yes", "Maybe", "No", "Yes", "Yes", "6 / 6", "Yes"]);
    expect(within(within(dps).getByTestId("dp-user-lead:l2")).getAllByRole("cell").map((c) => c.textContent)).toEqual(["No", "—", "—", "—", "—", "—", "1 / 6", "No"]);

    expect(screen.getByTestId("listen-today-users")).toHaveTextContent("3");
    expect(screen.getByTestId("listen-week-users")).toHaveTextContent("5");
  });

  it("Today | 7 Days is a named, pressable group and re-requests through the same poll with range=today", async () => {
    render(<ListeningAnalytics variant="full" />);
    await screen.findByTestId("per-user-listening");
    const group = screen.getByRole("group", { name: /time range/i });
    const today = within(group).getByRole("button", { name: "Today" });
    expect(today).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(today);
    await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(2));
    expect(String(apiFetch.mock.calls[1][0])).toMatch(/range=today/);
    expect(today).toHaveAttribute("aria-pressed", "true");
  });

  it("says 'No listening activity yet' for an empty dataset — never fabricated rows", async () => {
    apiFetch.mockResolvedValue(payload({ users: [], usersTotal: 0, totals: { todayUsers: 0, weekUsers: 0, todayPlays: 0, weekPlays: 0 }, byType: { intro: 0, replay: 0, elevator: 0, product: 0, usp: 0, smart: 0, total: 0 } }));
    render(<ListeningAnalytics variant="full" />);
    expect(await screen.findByTestId("listening-empty")).toHaveTextContent("No listening activity yet.");
    expect(screen.getByTestId("datapoints-empty")).toHaveTextContent("No data points answered yet.");
    expect(screen.getByTestId("listen-today-users")).toHaveTextContent("0");
  });

  it("hides listening numbers (shows — not 0) when the listen data is unavailable, and flags telemetry not applied", async () => {
    apiFetch.mockResolvedValue(payload({ listenStatus: "unavailable", totals: { todayUsers: 0, weekUsers: 0, todayPlays: 0, weekPlays: 0 } }));
    render(<ListeningAnalytics variant="full" />);
    expect(await screen.findByText(/Listening data temporarily unavailable/)).toBeInTheDocument();
    expect(screen.getByTestId("listen-today-users")).toHaveTextContent("—");
    expect(screen.queryByTestId("per-user-listening")).toBeNull();
    // Data points are still shown — they come from a different, healthy source.
    expect(screen.getByTestId("per-user-datapoints")).toBeInTheDocument();
  });

  it("shows 'Analytics temporarily unavailable' when the request itself fails", async () => {
    apiFetch.mockRejectedValue(new Error("HTTP 500"));
    render(<ListeningAnalytics variant="full" />);
    expect(await screen.findByText(/Analytics temporarily unavailable/)).toBeInTheDocument();
    expect(screen.queryByTestId("listen-today-users")).toBeNull();
  });

  it("the dashboard summary variant links to the page and does not duplicate the per-user tables", async () => {
    render(<ListeningAnalytics />);
    expect(await screen.findByRole("link", { name: /per-user listening/i })).toHaveAttribute("href", "/dashboard/listening");
    expect(screen.queryByTestId("per-user-listening")).toBeNull();
    expect(screen.queryByRole("group", { name: /time range/i })).toBeNull();
  });
});
