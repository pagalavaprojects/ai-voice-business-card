-- Vapi speaks `firstMessage` verbatim, before the model or system prompt
-- ever runs — a scripted opening line (e.g. a specific pitch a founder
-- wants read word-for-word) can't live inside the identity prompt module,
-- since that module only reaches the conversation from turn two onward.
ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS first_message TEXT;
