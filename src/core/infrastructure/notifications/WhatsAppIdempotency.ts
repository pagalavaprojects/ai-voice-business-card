import { supabaseAdmin } from "@/shared/lib/supabase";
import { Logger } from "@/shared/lib/logger";

/**
 * Meta retries a webhook delivery that doesn't ack fast enough or returns a
 * non-2xx — so the SAME inbound WhatsApp message can arrive more than once.
 * A plain INSERT into a table keyed on the message id is enough: Postgres's
 * own primary-key constraint is the race-safe check (no separate
 * read-then-write step that two concurrent requests could both pass).
 */
export interface IWhatsAppIdempotencyStore {
  /** Returns true if this is the FIRST time this message id has been seen
   * (and records it) — false if it's a duplicate delivery that must be
   * acknowledged (200) WITHOUT being processed again. */
  claimMessage(waMessageId: string): Promise<boolean>;
}

const DUPLICATE_KEY = "23505";

export class SupabaseWhatsAppIdempotencyStore implements IWhatsAppIdempotencyStore {
  async claimMessage(waMessageId: string): Promise<boolean> {
    const { error } = await supabaseAdmin.from("whatsapp_processed_messages").insert({ wa_message_id: waMessageId });
    if (!error) return true;
    if (error.code === DUPLICATE_KEY) return false;
    // An unexpected persistence error must not silently swallow the
    // message (a real defect masquerading as "duplicate, skip") — but it
    // also must not crash the webhook handler, so the caller decides.
    Logger.warn("WhatsApp idempotency claim failed", { error: error.message });
    throw new Error(`claimMessage failed: ${error.message}`);
  }
}
