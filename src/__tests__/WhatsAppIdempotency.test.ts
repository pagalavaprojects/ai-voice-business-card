const insert = jest.fn();
jest.mock("@/shared/lib/supabase", () => ({
  supabaseAdmin: { from: () => ({ insert }) },
}));

import { SupabaseWhatsAppIdempotencyStore } from "@/core/infrastructure/notifications/WhatsAppIdempotency";

describe("SupabaseWhatsAppIdempotencyStore", () => {
  beforeEach(() => jest.clearAllMocks());

  it("claims a message id it has never seen before", async () => {
    insert.mockResolvedValue({ error: null });
    const store = new SupabaseWhatsAppIdempotencyStore();
    expect(await store.claimMessage("wamid.NEW")).toBe(true);
  });

  it("treats a primary-key conflict as an already-seen duplicate, not an error", async () => {
    insert.mockResolvedValue({ error: { code: "23505", message: "duplicate key" } });
    const store = new SupabaseWhatsAppIdempotencyStore();
    expect(await store.claimMessage("wamid.DUP")).toBe(false);
  });

  it("throws (rather than silently treating as duplicate) on a genuine, unrelated persistence error", async () => {
    insert.mockResolvedValue({ error: { code: "08006", message: "connection lost" } });
    const store = new SupabaseWhatsAppIdempotencyStore();
    await expect(store.claimMessage("wamid.X")).rejects.toThrow(/connection lost/);
  });
});
