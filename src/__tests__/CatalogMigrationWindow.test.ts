import { SupabaseKnowledgeRepository } from "@/core/infrastructure/database/supabase/SupabaseKnowledgeRepository";

/**
 * Regression test for a real production incident.
 *
 * The services release deployed ahead of its migration. Every public read then
 * queried `is_active` / `display_order`, which did not exist yet, so the
 * queries errored and the card showed zero products and zero services. Worse,
 * prompt assembly reads through the same repository, so the assembled system
 * prompt came back null and the live voice assistant ran with no knowledge of
 * the company at all — a total capability loss from one missing column.
 *
 * The public read path now falls back to the pre-migration query shape during
 * that window. Returning every row matches the migration's own default of
 * is_active = TRUE, so nothing that was visible before becomes invisible.
 */
const MISSING_COLUMN = { code: "42703", message: 'column services.is_active does not exist' };

interface QueryLog {
  filters: string[];
}

/** Minimal PostgREST-shaped builder: records which filters were applied and
 * resolves with whatever the scenario dictates. */
function makeBuilder(log: QueryLog, result: { data: unknown; error: unknown }) {
  const builder = {
    select: () => builder,
    eq: (col: string) => {
      log.filters.push(col);
      return builder;
    },
    is: (col: string) => {
      log.filters.push(col);
      return builder;
    },
    order: (col: string) => {
      log.filters.push(`order:${col}`);
      return builder;
    },
    textSearch: () => builder,
    maybeSingle: () => Promise.resolve(result),
    then: (resolve: (v: unknown) => void) => resolve(result),
  };
  return builder;
}

// `data` covers both list-shaped results (products/services) and the single
// object `.maybeSingle()` resolves to (employee slug lookup).
const state: { calls: QueryLog[]; results: Array<{ data: unknown; error: unknown }> } = { calls: [], results: [] };

jest.mock("@/shared/lib/supabase", () => ({
  supabaseAdmin: {
    from: () => {
      const log: QueryLog = { filters: [] };
      state.calls.push(log);
      const result = state.results.shift() ?? { data: [], error: null };
      return makeBuilder(log, result);
    },
  },
}));

describe("catalog reads during the deploy-before-migrate window", () => {
  beforeEach(() => {
    state.calls = [];
    state.results = [];
  });

  it("falls back to the legacy query when is_active does not exist yet", async () => {
    state.results = [
      { data: null, error: MISSING_COLUMN },
      { data: [{ id: "s1", name: "Plug-and-Play AI Department" }], error: null },
    ];

    const services = await new SupabaseKnowledgeRepository().getServicesByCompany("c1");

    expect(services).toHaveLength(1);
    // Two queries: the modern one, then the fallback without the new columns.
    expect(state.calls).toHaveLength(2);
    expect(state.calls[0].filters).toContain("is_active");
    expect(state.calls[1].filters).not.toContain("is_active");
  });

  it("does the same for products, so the card and the AI prompt stay populated", async () => {
    state.results = [
      { data: null, error: { code: "42703", message: "column products.display_order does not exist" } },
      { data: [{ id: "p1", name: "AI Department" }], error: null },
    ];

    expect(await new SupabaseKnowledgeRepository().getProductsByCompany("c1")).toHaveLength(1);
  });

  it("still throws on a genuine database failure — the fallback is not a blanket catch", async () => {
    // Losing a real error here would turn an outage into a silently empty card.
    state.results = [{ data: null, error: { code: "08006", message: "connection failure" } }];

    await expect(new SupabaseKnowledgeRepository().getServicesByCompany("c1")).rejects.toThrow(/connection failure/);
  });

  it("uses the modern query untouched once the migration has been applied", async () => {
    state.results = [{ data: [{ id: "s1" }], error: null }];

    await new SupabaseKnowledgeRepository().getServicesByCompany("c1");

    expect(state.calls).toHaveLength(1);
    expect(state.calls[0].filters).toContain("is_active");
    expect(state.calls[0].filters).toContain("order:display_order");
  });
});

/**
 * Same window, same principle, for the short public-URL slug (migration
 * 20260808): a card printed on a business card must not start 404ing just
 * because /c/{slug} looked up a column that isn't there yet. Unlike the
 * catalog fallback above, there is no legacy query to fall back to — the
 * feature is simply unavailable pre-migration, which getEmployeeBySlug
 * expresses as returning null rather than throwing.
 */
describe("employee slug lookup during the deploy-before-migrate window", () => {
  beforeEach(() => {
    state.calls = [];
    state.results = [];
  });

  it("returns null (not found), not an error, when the slug column does not exist yet", async () => {
    state.results = [{ data: null, error: { code: "42703", message: "column employees.slug does not exist" } }];

    await expect(new SupabaseKnowledgeRepository().getEmployeeBySlug("srinivasan")).resolves.toBeNull();
  });

  it("resolves the employee once the migration has applied and the slug is set", async () => {
    state.results = [{ data: { id: "e1", slug: "srinivasan" }, error: null }];

    const employee = await new SupabaseKnowledgeRepository().getEmployeeBySlug("srinivasan");
    expect(employee).toEqual({ id: "e1", slug: "srinivasan" });
  });

  it("still throws on a genuine database failure", async () => {
    state.results = [{ data: null, error: { code: "08006", message: "connection failure" } }];

    await expect(new SupabaseKnowledgeRepository().getEmployeeBySlug("srinivasan")).rejects.toThrow(/connection failure/);
  });
});
