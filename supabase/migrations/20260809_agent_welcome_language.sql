-- Tags what language ai_agents.first_message is written in. Vapi speaks
-- whatever text is stored in first_message regardless of this value — it
-- carries no runtime behavior on its own — but it's what makes "swap the
-- greeting to another language" a data edit (this column + the text) rather
-- than a code change, satisfying multilingual support without a full i18n
-- system nobody asked for yet.
--
-- Purely additive, defaulted, off the public critical path: nothing reads
-- this column to decide what to do, so its absence pre-migration changes
-- nothing about how a live call behaves.
ALTER TABLE ai_agents
    ADD COLUMN IF NOT EXISTS welcome_message_language VARCHAR(10) DEFAULT 'en' NOT NULL;
