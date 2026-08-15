-- Adds WhatsApp as a second channel for the EXISTING qualification engine
-- (get_next_qualification_question, classifyClosedResponse, the
-- conversationId-based lead resolution built in the lead-qualification-engine
-- migration). No new questionnaire, classification, or persistence format —
-- this only adds the state a stateless webhook needs that a live voice call's
-- own LLM context already holds implicitly (which question is pending) and
-- the plumbing to route an inbound message to the right tenant and to make
-- webhook retries/near-simultaneous messages safe.

-- Maps an inbound WhatsApp message to a tenant: Meta's webhook is ONE URL per
-- WhatsApp Business Account, not one per company, so the RECEIVING
-- phone_number_id (present on every inbound webhook payload) is the only
-- signal available to resolve which employee's qualification flow should
-- handle it. Mirrors the existing per-employee voice_id column.
ALTER TABLE employees
    ADD COLUMN IF NOT EXISTS whatsapp_phone_number_id TEXT UNIQUE;

-- `channel` lets the existing qualification-status/lead views distinguish
-- where a conversation came from without a second persistence format —
-- qualification_notes/lead_temperature stay exactly as-is regardless of
-- channel. `whatsapp_wa_id` is the sender's stable WhatsApp identity,
-- the direct analogue of vapi_call_id (voice's per-call identity) — a
-- WhatsApp conversation persists across many messages/days, so this is
-- looked up on every inbound message instead of created once per call.
-- `whatsapp_pending_question` is the ONE piece of state that has no voice
-- equivalent: a live call's LLM holds "which question did I just ask" in
-- its own context; a stateless webhook request has nothing to hold that,
-- so the server must persist it explicitly between messages.
ALTER TABLE conversations
    ADD COLUMN IF NOT EXISTS channel VARCHAR(10) NOT NULL DEFAULT 'voice'
        CHECK (channel IN ('voice', 'whatsapp')),
    ADD COLUMN IF NOT EXISTS whatsapp_wa_id TEXT,
    ADD COLUMN IF NOT EXISTS whatsapp_pending_question INT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_conversations_whatsapp_wa_id
    ON conversations(whatsapp_wa_id)
    WHERE whatsapp_wa_id IS NOT NULL;

-- Idempotency: Meta retries webhook deliveries that don't ack fast enough or
-- return non-2xx. The message id is globally unique per Meta's API, so a
-- plain INSERT-then-conflict-means-duplicate check (no read-then-write race)
-- is sufficient and requires no locking of its own.
CREATE TABLE IF NOT EXISTS whatsapp_processed_messages (
    wa_message_id TEXT PRIMARY KEY,
    processed_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Concurrency: protects against two inbound messages from the SAME sender
-- being processed at once (a double-send, or a retry arriving while the
-- original request is still in flight) from both reading the same "pending
-- question" and both advancing it. Keyed on wa_id directly (not
-- conversation_id) so the lock can be acquired the instant a webhook
-- payload arrives, before any conversation lookup. A losing acquire is
-- treated as "someone is already handling this sender's message right
-- now" and that message is dropped rather than double-processed — Meta
-- will not retry an already-200'd delivery, so at most one of the two ever
-- advances the questionnaire, which is the correctness property Phase 10
-- requires.
CREATE TABLE IF NOT EXISTS whatsapp_sender_locks (
    wa_id TEXT PRIMARY KEY,
    locked_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);
