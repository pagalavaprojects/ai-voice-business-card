-- Indexes for lookups on the live voice path, all of which were sequential
-- scans. Harmless at low volume; vapi_call_id degrades first because it is
-- queried several times per call.

-- getOrCreateConversationByVapiCallId — runs on EVERY webhook: the
-- assistant-request, each individual tool call, and the end-of-call report.
-- Unique because one Vapi call maps to exactly one conversation, so this
-- also makes the get-or-create genuinely safe under concurrent webhooks
-- instead of relying on them never overlapping.
CREATE UNIQUE INDEX IF NOT EXISTS idx_conversations_vapi_call_id
    ON conversations(vapi_call_id)
    WHERE vapi_call_id IS NOT NULL;

-- End-of-call report: finds the lead attached to the finished conversation.
CREATE INDEX IF NOT EXISTS idx_leads_conversation
    ON leads(conversation_id)
    WHERE conversation_id IS NOT NULL;

-- End-of-call report: links the most recent appointment for that lead.
CREATE INDEX IF NOT EXISTS idx_appointments_lead_created
    ON appointments(lead_id, created_at DESC);

-- Transcript rendering, ordered as the repository reads it.
CREATE INDEX IF NOT EXISTS idx_conversation_messages_conversation
    ON conversation_messages(conversation_id, created_at);
