import { supabaseAdmin } from "@/shared/lib/supabase";

/**
 * A cross-request atomic claim/lock.
 *
 * Postgres's own primary-key constraint is the race-safe primitive: a plain
 * INSERT either succeeds (this caller claimed the key) or fails with a unique
 * violation (someone else already holds it) — there is no read-then-write
 * window two concurrent callers could both pass. It is the same technique the
 * WhatsApp inbound de-dupe already relies on.
 *
 * It is backed by the `whatsapp_processed_messages` table because that is the
 * ONE primary-key-constrained claim table already applied to production. A
 * dedicated `processing_claims` table would be cleaner, but it needs a schema
 * migration, and `supabase db push` currently cannot be run safely: the remote
 * has an unrelated, unreviewed migration pending unapplied (20260729 v2
 * enterprise schema), which db push would also apply. Claim keys are namespaced
 * (e.g. "formbook:", "reminder:") so they can never collide with a real
 * WhatsApp message id.
 */
const DUPLICATE_KEY = "23505";

/** Atomically claim `key`. Returns true if THIS caller acquired it, false if
 * another caller already holds it. Throws only on an unexpected store error. */
export async function acquireClaim(key: string): Promise<boolean> {
  const { error } = await supabaseAdmin.from("whatsapp_processed_messages").insert({ wa_message_id: key });
  if (!error) return true;
  if (error.code === DUPLICATE_KEY) return false;
  throw new Error(`acquireClaim failed: ${error.message}`);
}

/** Release a previously-acquired claim so the key can be claimed again (e.g.
 * a short-lived booking lock after the work is done, or a reminder claim whose
 * send failed and must stay retryable). Best-effort: a release failure must not
 * fail the caller's own successful work. */
export async function releaseClaim(key: string): Promise<void> {
  await supabaseAdmin.from("whatsapp_processed_messages").delete().eq("wa_message_id", key);
}
