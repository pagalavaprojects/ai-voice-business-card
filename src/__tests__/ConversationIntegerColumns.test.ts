import { SupabaseConversationRepository } from "@/core/infrastructure/database/supabase/SupabaseConversationRepository";

/**
 * Regression test for a production failure: Vapi reports call duration as a
 * float (19.488), conversations.duration_seconds is an INT column, and
 * Postgres rejects the write outright with
 * `invalid input syntax for type integer: "19.488"`.
 *
 * The whole end-of-call report was lost as a result — no transcript, no
 * summary, no duration, no tools_called — because one field of the update
 * was the wrong numeric type.
 */
const updateSpy = jest.fn();

jest.mock("@/shared/lib/supabase", () => ({
  supabaseAdmin: {
    from: () => ({
      update: (payload: Record<string, unknown>) => {
        updateSpy(payload);
        return {
          eq: () => ({
            select: () => ({
              single: async () => ({ data: { id: "conv-1" }, error: null }),
            }),
          }),
        };
      },
    }),
  },
}));

describe("endConversation integer coercion", () => {
  beforeEach(() => updateSpy.mockClear());

  it("rounds a fractional duration from Vapi to an integer", async () => {
    await new SupabaseConversationRepository().endConversation("conv-1", {
      durationSeconds: 19.488,
      summary: "s",
      transcript: "t",
    });

    const payload = updateSpy.mock.calls[0][0];
    expect(payload.duration_seconds).toBe(19);
    expect(Number.isInteger(payload.duration_seconds)).toBe(true);
  });

  it("rounds lead_score too — the other INT column on this table", async () => {
    await new SupabaseConversationRepository().endConversation("conv-1", {
      durationSeconds: 10,
      leadScore: 72.6,
    });
    expect(updateSpy.mock.calls[0][0].lead_score).toBe(73);
  });

  it("writes NULL rather than failing when the value is absent or non-finite", async () => {
    await new SupabaseConversationRepository().endConversation("conv-1", {
      durationSeconds: Number.NaN,
      leadScore: undefined,
    });
    const payload = updateSpy.mock.calls[0][0];
    // Losing a duration is far cheaper than losing the transcript and summary
    // that would have been written in the same statement.
    expect(payload.duration_seconds).toBeNull();
    expect(payload.lead_score).toBeNull();
  });
});
