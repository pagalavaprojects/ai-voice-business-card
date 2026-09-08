/**
 * @jest-environment jsdom
 *
 * Item 14 — the ONE simple page. Renders the full variant against the real
 * useLivePoll with a mocked API and proves: per-user listening table (all six
 * clips), per-user DP1–DP6 table with Yes/No/Maybe and completion, the
 * range-scoped KPIs, the Today | 7 Days toggle re-requesting through the same
 * poll (exactly one request per change, each way), honest empty /
 * not-applied / unavailable states, and the accessibility skeleton.
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
const HOUR = 3600_000;
const user = (over: Record<string, unknown>) => ({
  key: "visitor:sessXXXX",
  label: "Visitor sessXXXX",
  kind: "visitor",
  identified: false,
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
    windows: { todayStart: new Date(m).toISOString(), weekStart: new Date(m - 6 * DAY).toISOString(), rangeStart: new Date(m - 6 * DAY).toISOString() },
    listenStatus: "ok",
    leadStatus: "ok",
    telemetryEnabled: true,
    totals: { todayUsers: 3, weekUsers: 5, todayPlays: 10, weekPlays: 14 },
    rangeTotals: { users: 5, plays: 14 },
    byType: { intro: 4, replay: 1, elevator: 3, product: 2, usp: 5, smart: 2, total: 17 },
    trend: Array.from({ length: 7 }, (_, i) => ({ day: new Date(m - (6 - i) * DAY).toISOString(), plays: i === 6 ? 10 : i === 3 ? 4 : 0 })),
    trendGranularity: "day",
    users: [
      user({ key: "lead:l1", label: "Srinivasan", kind: "lead", identified: true, leadId: "l1", plays: { intro: 4, replay: 1, elevator: 3, product: 2, usp: 5, smart: 2, total: 17 }, dataPoints: ["YES", "YES", "MAYBE", "NO", "YES", "YES"], answered: 6, completed: true }),
      user({ key: "lead:l2", label: "Priya", kind: "lead", identified: true, leadId: "l2", dataPoints: ["NO", null, null, null, null, null], answered: 1 }),
    ],
    usersTotal: 2,
    appointments: { bookedWeek: 1, bookedTotal: 2, requestedTotal: 0 },
    definitions: { user: "One visitor.", today: "From local midnight.", week: "Last 7 local days.", plays: "Genuine plays only." },
    ...over,
  };
}
/** What the API returns for range=today: only today's figures, hourly trend. */
function todayPayload() {
  const m = midnight().getTime();
  const hours = Math.min(24, Math.max(1, Math.floor((Date.now() - m) / HOUR) + 1));
  return payload({
    range: "today",
    windows: { todayStart: new Date(m).toISOString(), weekStart: new Date(m - 6 * DAY).toISOString(), rangeStart: new Date(m).toISOString() },
    rangeTotals: { users: 3, plays: 10 },
    byType: { intro: 2, replay: 0, elevator: 3, product: 2, usp: 3, smart: 0, total: 10 },
    trend: Array.from({ length: hours }, (_, i) => ({ day: new Date(m + i * HOUR).toISOString(), plays: i === hours - 1 ? 10 : 0 })),
    trendGranularity: "hour",
    users: [user({ key: "lead:l1", label: "Srinivasan", kind: "lead", identified: true, leadId: "l1", plays: { intro: 2, replay: 0, elevator: 3, product: 2, usp: 3, smart: 0, total: 10 }, dataPoints: ["YES", "YES", "MAYBE", "NO", "YES", "YES"], answered: 6, completed: true })],
    usersTotal: 1,
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  apiFetch.mockImplementation(async (url: string) => (String(url).includes("range=today") ? todayPayload() : payload()));
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
    expect(within(listening).queryByTestId("listen-user-lead:l2")).toBeNull();

    const dps = screen.getByTestId("per-user-datapoints");
    expect(within(dps).getAllByRole("columnheader").map((h) => h.textContent)).toEqual(["User", "DP1", "DP2", "DP3", "DP4", "DP5", "DP6", "Answered", "Completed"]);
    expect(within(within(dps).getByTestId("dp-user-lead:l1")).getAllByRole("cell").map((c) => c.textContent)).toEqual(["Yes", "Yes", "Maybe", "No", "Yes", "Yes", "6 / 6", "Yes"]);
    expect(within(within(dps).getByTestId("dp-user-lead:l2")).getAllByRole("cell").map((c) => c.textContent)).toEqual(["No", "—", "—", "—", "—", "—", "1 / 6", "No"]);
  });

  it("7 Days is the default: KPIs show the 7-day figures (unique users de-duplicated across the range) and the trend has seven daily buckets", async () => {
    render(<ListeningAnalytics variant="full" />);
    await screen.findByTestId("per-user-listening");
    expect(screen.getByTestId("listen-range-users")).toHaveTextContent("5");
    expect(screen.getByTestId("listen-range-users")).toHaveTextContent(/last 7 days/);
    expect(screen.getByTestId("listen-range-plays")).toHaveTextContent("14");
    const trend = screen.getByTestId("trend-section");
    expect(trend).toHaveTextContent(/Plays per day, last 7 local days/);
    // Seven labelled buckets (zero days included), oldest first, today last.
    const labels = within(trend).getAllByText(/^(Sun|Mon|Tue|Wed|Thu|Fri|Sat)/).map((e) => e.textContent);
    expect(labels).toHaveLength(7);
    const m = midnight();
    expect(labels[6]).toBe(m.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" }));
    expect(labels[0]).toBe(new Date(m.getTime() - 6 * DAY).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" }));
  });

  it("Today → 7 Days → Today: each switch is exactly ONE request through the same poll, and every section follows the range", async () => {
    render(<ListeningAnalytics variant="full" />);
    await screen.findByTestId("per-user-listening");
    expect(apiFetch).toHaveBeenCalledTimes(1);
    const group = screen.getByRole("group", { name: /time range/i });
    const today = within(group).getByRole("button", { name: "Today" });
    const week = within(group).getByRole("button", { name: "7 Days" });
    expect(week).toHaveAttribute("aria-pressed", "true");
    expect(today).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(today);
    await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(2));
    expect(String(apiFetch.mock.calls[1][0])).toMatch(/range=today/);
    expect(today).toHaveAttribute("aria-pressed", "true");
    await waitFor(() => expect(screen.getByTestId("listen-range-users")).toHaveTextContent("3"));
    expect(screen.getByTestId("listen-range-users")).toHaveTextContent(/today/);
    expect(screen.getByTestId("listen-range-plays")).toHaveTextContent("10");
    expect(screen.getByTestId("trend-section")).toHaveTextContent(/Plays per hour, today/);
    expect(within(screen.getByTestId("listen-user-lead:l1")).getAllByRole("cell").map((c) => c.textContent)).toEqual(["2", "0", "3", "2", "3", "0", "10"]);
    expect(screen.getByRole("heading", { name: /Per-user listening, today/ })).toBeInTheDocument();

    fireEvent.click(week);
    await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(3));
    expect(String(apiFetch.mock.calls[2][0])).toMatch(/range=7d/);
    await waitFor(() => expect(screen.getByTestId("listen-range-users")).toHaveTextContent("5"));
    expect(screen.getByTestId("trend-section")).toHaveTextContent(/Plays per day, last 7 local days/);
    expect(within(screen.getByTestId("listen-user-lead:l1")).getAllByRole("cell").map((c) => c.textContent)).toEqual(["4", "1", "3", "2", "5", "2", "17"]);
    expect(apiFetch).toHaveBeenCalledTimes(3);
  });

  it("says 'No listening activity yet' for an empty dataset — never fabricated rows", async () => {
    apiFetch.mockResolvedValue(payload({ users: [], usersTotal: 0, totals: { todayUsers: 0, weekUsers: 0, todayPlays: 0, weekPlays: 0 }, rangeTotals: { users: 0, plays: 0 }, byType: { intro: 0, replay: 0, elevator: 0, product: 0, usp: 0, smart: 0, total: 0 } }));
    render(<ListeningAnalytics variant="full" />);
    expect(await screen.findByTestId("listening-empty")).toHaveTextContent("No listening activity yet.");
    expect(screen.getByTestId("datapoints-empty")).toHaveTextContent("No data points answered yet.");
    expect(screen.getByTestId("listen-range-users")).toHaveTextContent("0");
  });

  it("hides listening numbers (shows — not 0) when the listen data is unavailable", async () => {
    apiFetch.mockResolvedValue(payload({ listenStatus: "unavailable", totals: { todayUsers: 0, weekUsers: 0, todayPlays: 0, weekPlays: 0 }, rangeTotals: { users: 0, plays: 0 } }));
    render(<ListeningAnalytics variant="full" />);
    expect(await screen.findByText(/Listening data temporarily unavailable/)).toBeInTheDocument();
    expect(screen.getByTestId("listen-range-users")).toHaveTextContent("—");
    expect(screen.queryByTestId("per-user-listening")).toBeNull();
    expect(screen.getByTestId("per-user-datapoints")).toBeInTheDocument();
  });

  it("shows 'Analytics temporarily unavailable' when the request itself fails", async () => {
    apiFetch.mockRejectedValue(new Error("HTTP 500"));
    render(<ListeningAnalytics variant="full" />);
    expect(await screen.findByText(/Analytics temporarily unavailable/)).toBeInTheDocument();
    expect(screen.queryByTestId("listen-range-users")).toBeNull();
  });

  it("the dashboard summary variant keeps both windows, links to the page and does not duplicate the per-user tables", async () => {
    render(<ListeningAnalytics />);
    expect(await screen.findByRole("link", { name: /per-user listening/i })).toHaveAttribute("href", "/dashboard/listening");
    expect(screen.getByTestId("listen-today-users")).toHaveTextContent("3");
    expect(screen.getByTestId("listen-week-users")).toHaveTextContent("5");
    expect(screen.queryByTestId("per-user-listening")).toBeNull();
    expect(screen.queryByRole("group", { name: /time range/i })).toBeNull();
  });
});
