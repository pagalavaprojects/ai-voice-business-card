import { computeTopTopics } from "@/shared/lib/dashboardTopics";

/**
 * Regression coverage for the dashboard's "Top Topics" widget — the honest
 * substitute for "top questions asked". conversations.intent is never
 * populated and transcripts aren't parsed, so there is no free-text question
 * log to summarize; this counts what tools actually fired instead, which is
 * real, already-stored data.
 */
describe("computeTopTopics", () => {
  it("ranks by frequency, most common first", () => {
    const rows = [
      { tools_called: ["search_products", "save_lead"] },
      { tools_called: ["search_products"] },
      { tools_called: ["search_services"] },
    ];

    const topics = computeTopTopics(rows);

    expect(topics[0]).toMatchObject({ tool: "search_products", count: 2 });
    expect(topics.map((t) => t.tool)).toContain("search_services");
    expect(topics.map((t) => t.tool)).toContain("save_lead");
  });

  it("maps known tool names to a human-readable label", () => {
    const topics = computeTopTopics([{ tools_called: ["book_appointment"] }]);
    expect(topics[0].label).toBe("Tried to book a meeting");
  });

  it("still surfaces a tool added later under its raw name rather than dropping it", () => {
    const topics = computeTopTopics([{ tools_called: ["some_future_tool"] }]);
    expect(topics[0]).toMatchObject({ tool: "some_future_tool", label: "some_future_tool", count: 1 });
  });

  it("ignores conversations with no tool calls rather than erroring on null", () => {
    expect(computeTopTopics([{ tools_called: null }, { tools_called: [] }])).toEqual([]);
  });

  it("returns nothing for an empty sample, so the widget can show an honest empty state", () => {
    expect(computeTopTopics([])).toEqual([]);
  });

  it("caps the ranking at the requested limit", () => {
    const rows = ["a", "b", "c", "d"].map((tool) => ({ tools_called: [tool] }));
    expect(computeTopTopics(rows, 2)).toHaveLength(2);
  });
});
