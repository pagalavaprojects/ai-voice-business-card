/** tools_called stores raw tool names (see KNOWN_TOOL_NAMES in ToolRegistry).
 * This is the only mapping from "what happened in the call" to "what a human
 * would call it" — there is no free-text question log to summarize instead:
 * conversations.intent is never populated and transcripts aren't parsed. A
 * genuine "top questions asked" widget would need that data captured first;
 * this is the honest substitute computable from what is actually stored. */
export const TOPIC_LABELS: Record<string, string> = {
  search_products: "Asked about products",
  search_services: "Asked about services",
  search_faqs: "Asked a specific question (FAQ lookup)",
  search_knowledge_base: "Asked something covered in an uploaded document",
  get_company_information: "Asked about the company",
  get_employee_information: "Asked about the person",
  book_appointment: "Tried to book a meeting",
  save_lead: "Shared contact details",
};

export interface TopTopic {
  tool: string;
  label: string;
  count: number;
}

/** Counts how often each tool fired across a sample of conversations, ranked
 * descending. An unrecognised tool name still surfaces under its raw name
 * rather than being dropped — a tool added later should be visible here
 * immediately, not silently excluded until this map catches up. */
export function computeTopTopics(rows: Array<{ tools_called: string[] | null }>, limit = 6): TopTopic[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    for (const tool of row.tools_called ?? []) {
      counts.set(tool, (counts.get(tool) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([tool, count]) => ({ tool, label: TOPIC_LABELS[tool] ?? tool, count }));
}
