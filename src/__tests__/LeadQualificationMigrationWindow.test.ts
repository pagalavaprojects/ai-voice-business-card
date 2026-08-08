import { SupabaseCRMRepository } from "@/core/infrastructure/database/supabase/SupabaseCRMRepository";

/**
 * Regression test for the same class of incident CatalogMigrationWindow.test.ts
 * covers, on the write side: the 20260812 lead-qualification-engine migration
 * adds 15 columns, and calculateAndSaveLeadScore's patch always includes at
 * least `lead_temperature` (never stripped as undefined). If that migration
 * reaches production after the application code does, PostgREST rejects the
 * whole update atomically — without a fallback, every save_lead /
 * update_lead_qualification call throws, which breaks lead capture entirely
 * rather than just degrading qualification.
 */
const MISSING_COLUMN_PGRST204 = {
  code: "PGRST204",
  message: "Could not find the 'lead_temperature' column of 'leads' in the schema cache",
};
const MISSING_COLUMN_42703 = { code: "42703", message: "column leads.lead_temperature does not exist" };

interface UpdateCall {
  patch: Record<string, unknown>;
}

function makeBuilder(calls: UpdateCall[], results: Array<{ data: unknown; error: unknown }>) {
  const builder = {
    update: (patch: Record<string, unknown>) => {
      calls.push({ patch });
      return builder;
    },
    eq: () => builder,
    select: () => builder,
    single: () => Promise.resolve(results.shift() ?? { data: null, error: { code: "08006", message: "connection failure" } }),
  };
  return builder;
}

const state: { calls: UpdateCall[]; results: Array<{ data: unknown; error: unknown }> } = { calls: [], results: [] };

jest.mock("@/shared/lib/supabase", () => ({
  supabaseAdmin: {
    from: () => makeBuilder(state.calls, state.results),
  },
}));

describe("updateLeadQualification during the deploy-before-migrate window", () => {
  beforeEach(() => {
    state.calls = [];
    state.results = [];
  });

  it("retries with qualification columns stripped when the migration hasn't landed (PGRST204)", async () => {
    state.results = [
      { data: null, error: MISSING_COLUMN_PGRST204 },
      { data: { id: "lead-1", score: 70, lead_temperature: undefined }, error: null },
    ];

    const lead = await new SupabaseCRMRepository().updateLeadQualification("lead-1", {
      score: 70,
      score_category: "HIGH" as never,
      lead_temperature: "HOT" as never,
      decision_maker: "yes" as never,
    });

    expect(lead).toEqual({ id: "lead-1", score: 70, lead_temperature: undefined });
    expect(state.calls).toHaveLength(2);
    // First attempt includes the new columns...
    expect(state.calls[0].patch).toHaveProperty("lead_temperature");
    expect(state.calls[0].patch).toHaveProperty("decision_maker");
    // ...the retry strips every qualification-engine column but keeps core fields.
    expect(state.calls[1].patch).not.toHaveProperty("lead_temperature");
    expect(state.calls[1].patch).not.toHaveProperty("decision_maker");
    expect(state.calls[1].patch).toMatchObject({ score: 70, score_category: "HIGH" });
  });

  it("also retries on the raw Postgres 42703 shape", async () => {
    state.results = [
      { data: null, error: MISSING_COLUMN_42703 },
      { data: { id: "lead-2" }, error: null },
    ];

    await expect(
      new SupabaseCRMRepository().updateLeadQualification("lead-2", { score: 10, lead_temperature: "COLD" as never })
    ).resolves.toEqual({ id: "lead-2" });
    expect(state.calls).toHaveLength(2);
  });

  it("succeeds in one call once the migration has been applied", async () => {
    state.results = [{ data: { id: "lead-3", lead_temperature: "WARM" }, error: null }];

    await new SupabaseCRMRepository().updateLeadQualification("lead-3", { score: 50, lead_temperature: "WARM" as never });

    expect(state.calls).toHaveLength(1);
    expect(state.calls[0].patch).toHaveProperty("lead_temperature", "WARM");
  });

  it("still throws on a genuine database failure — the fallback is not a blanket catch", async () => {
    state.results = [{ data: null, error: { code: "08006", message: "connection failure" } }];

    await expect(
      new SupabaseCRMRepository().updateLeadQualification("lead-4", { score: 10 })
    ).rejects.toThrow(/connection failure/);
    expect(state.calls).toHaveLength(1);
  });

  it("throws if even the fallback write fails", async () => {
    state.results = [
      { data: null, error: MISSING_COLUMN_PGRST204 },
      { data: null, error: { code: "08006", message: "connection failure on retry" } },
    ];

    await expect(
      new SupabaseCRMRepository().updateLeadQualification("lead-5", { score: 10, lead_temperature: "COLD" as never })
    ).rejects.toThrow(/connection failure on retry/);
  });
});
