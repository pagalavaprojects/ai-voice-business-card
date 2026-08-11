import { supabaseAdmin } from "@/shared/lib/supabase";

/**
 * Guards against two inbound WhatsApp messages from the SAME sender being
 * processed at once (a double-send, or a retry arriving while the original
 * request is still in flight) both reading the same "pending question" and
 * both advancing it. Keyed on the sender's wa_id directly — available the
 * instant a webhook payload arrives, no conversation lookup needed first.
 * A losing acquire means "someone is already handling this sender's
 * message right now" — that message is dropped rather than queued, which
 * is correct here: Meta will not retry an already-200'd delivery, so at
 * most one of the two concurrent messages ever advances the questionnaire
 * — never both, never neither.
 *
 * Implemented as a row insert (Postgres's own primary-key constraint is the
 * race-safe check) rather than a read-then-write "is it locked?" query,
 * which two simultaneous requests could both pass.
 */
export interface IWhatsAppConversationLock {
  /** True if the lock was acquired. False means another request is
   * currently processing a message from this sender. */
  tryAcquire(waId: string): Promise<boolean>;
  release(waId: string): Promise<void>;
}

const DUPLICATE_KEY = "23505";
// A request that holds the lock for longer than this is assumed to have
// crashed without releasing it (not currently possible in this handler's
// synchronous flow, but the safety net costs nothing and prevents a stuck
// lock from permanently blocking a sender).
const STALE_LOCK_MS = 30_000;

export class SupabaseWhatsAppConversationLock implements IWhatsAppConversationLock {
  async tryAcquire(waId: string): Promise<boolean> {
    const { error } = await supabaseAdmin.from("whatsapp_sender_locks").insert({ wa_id: waId });
    if (!error) return true;
    if (error.code !== DUPLICATE_KEY) throw new Error(`tryAcquire failed: ${error.message}`);

    // Held by someone else — check whether it's actually stale before
    // conceding the lock.
    const { data: existing } = await supabaseAdmin.from("whatsapp_sender_locks").select("locked_at").eq("wa_id", waId).maybeSingle();
    const lockedAt = existing?.locked_at ? new Date(existing.locked_at).getTime() : 0;
    if (Date.now() - lockedAt < STALE_LOCK_MS) return false;

    // Stale — reclaim it. A concurrent reclaimer racing this exact instant
    // is an accepted, rare edge case (recovering from a crash, not the
    // live-concurrency case this lock exists to prevent).
    await supabaseAdmin.from("whatsapp_sender_locks").delete().eq("wa_id", waId);
    const retry = await supabaseAdmin.from("whatsapp_sender_locks").insert({ wa_id: waId });
    return !retry.error;
  }

  async release(waId: string): Promise<void> {
    await supabaseAdmin.from("whatsapp_sender_locks").delete().eq("wa_id", waId);
  }
}
