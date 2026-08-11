/**
 * Proves the concurrency guarantee Phase 10 requires: two near-simultaneous
 * inbound messages from the SAME WhatsApp sender must never both be
 * processed at once — exactly one tryAcquire succeeds, the loser is told
 * to drop its message rather than double-advance the questionnaire.
 */
const insert = jest.fn();
const del = jest.fn();
const maybeSingle = jest.fn();

jest.mock("@/shared/lib/supabase", () => ({
  supabaseAdmin: {
    from: () => ({
      insert,
      delete: () => ({ eq: del }),
      select: () => ({ eq: () => ({ maybeSingle }) }),
    }),
  },
}));

import { SupabaseWhatsAppConversationLock } from "@/core/infrastructure/notifications/WhatsAppConversationLock";

describe("SupabaseWhatsAppConversationLock", () => {
  beforeEach(() => jest.clearAllMocks());

  it("acquires a lock that no one else holds", async () => {
    insert.mockResolvedValue({ error: null });
    const lock = new SupabaseWhatsAppConversationLock();
    expect(await lock.tryAcquire("919999999999")).toBe(true);
  });

  it("a second, concurrent acquire for the SAME sender fails while the first is still held — the exact race Phase 10 requires be prevented", async () => {
    const lock = new SupabaseWhatsAppConversationLock();
    insert.mockResolvedValueOnce({ error: null });
    expect(await lock.tryAcquire("919999999999")).toBe(true); // first message: wins

    insert.mockResolvedValueOnce({ error: { code: "23505", message: "duplicate key" } });
    maybeSingle.mockResolvedValueOnce({ data: { locked_at: new Date().toISOString() } }); // fresh, not stale
    expect(await lock.tryAcquire("919999999999")).toBe(false); // second, near-simultaneous message: loses
  });

  it("reclaims a stale lock (crashed request that never released) rather than blocking the sender forever", async () => {
    insert.mockResolvedValueOnce({ error: { code: "23505", message: "duplicate key" } });
    maybeSingle.mockResolvedValueOnce({ data: { locked_at: new Date(Date.now() - 60_000).toISOString() } }); // 60s old
    del.mockResolvedValue({ error: null });
    insert.mockResolvedValueOnce({ error: null }); // reclaim succeeds
    const lock = new SupabaseWhatsAppConversationLock();

    expect(await lock.tryAcquire("919999999999")).toBe(true);
    expect(del).toHaveBeenCalled();
  });

  it("release deletes the lock row so a later message from the same sender can proceed", async () => {
    del.mockResolvedValue({ error: null });
    const lock = new SupabaseWhatsAppConversationLock();
    await lock.release("919999999999");
    expect(del).toHaveBeenCalledWith("wa_id", "919999999999");
  });

  it("throws on a genuine persistence error rather than silently treating it as lock contention", async () => {
    insert.mockResolvedValue({ error: { code: "08006", message: "connection lost" } });
    const lock = new SupabaseWhatsAppConversationLock();
    await expect(lock.tryAcquire("919999999999")).rejects.toThrow(/connection lost/);
  });
});
