-- Multilingual voice assistant support.
--
-- Purely additive, same discipline as every migration before it: nothing
-- here can blank an existing card. A company that never touches any of
-- this keeps behaving exactly as today — English/Tamil single-language,
-- driven by the existing ai_agents.first_message/welcome_message_language.

-- 1. Platform-wide language catalog. Seeded with the initial release's three
--    languages; a future language is "add a row" (plus its locale/greeting
--    content in code), never a schema change — this is what makes the
--    architecture support unlimited languages without code duplication.
CREATE TABLE IF NOT EXISTS languages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    -- ISO 639-1 code, e.g. 'ta', 'en', 'hi' — the same short code used
    -- throughout the app (locale file names, transcriber language, etc.).
    code VARCHAR(10) UNIQUE NOT NULL,
    name VARCHAR(80) NOT NULL,
    native_name VARCHAR(80) NOT NULL,
    is_active BOOLEAN DEFAULT TRUE NOT NULL,
    is_default BOOLEAN DEFAULT FALSE NOT NULL,
    -- Deepgram's transcriber language code (see @vapi-ai/web's
    -- DeepgramTranscriber type) — confirmed to support 'ta' and 'hi'
    -- directly, not assumed.
    speech_locale VARCHAR(10) NOT NULL,
    tts_provider VARCHAR(20) DEFAULT 'openai' NOT NULL,
    voice_model VARCHAR(80),
    is_rtl BOOLEAN DEFAULT FALSE NOT NULL,
    display_order INT DEFAULT 0 NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Exactly one default language platform-wide (partial unique index rather
-- than a boolean-with-trigger — simpler, and Postgres enforces it for free).
CREATE UNIQUE INDEX IF NOT EXISTS idx_languages_single_default
    ON languages (is_default) WHERE is_default = TRUE;

INSERT INTO languages (code, name, native_name, is_active, is_default, speech_locale, tts_provider, voice_model, is_rtl, display_order)
VALUES
    ('ta', 'Tamil', 'தமிழ்', TRUE, TRUE, 'ta', 'openai', 'nova', FALSE, 1),
    ('en', 'English', 'English', TRUE, FALSE, 'en', 'openai', 'nova', FALSE, 2),
    ('hi', 'Hindi', 'हिन्दी', TRUE, FALSE, 'hi', 'openai', 'nova', FALSE, 3)
ON CONFLICT (code) DO NOTHING;

-- 2. Per-company overrides — which of the platform's languages this company
--    exposes, and its own default. NULL/absent means "inherit the platform
--    catalog as-is" (all active languages, platform default) — the same
--    inherit-unless-overridden pattern voice_settings already uses.
ALTER TABLE settings
    ADD COLUMN IF NOT EXISTS language_settings JSONB DEFAULT '{}'::jsonb;

-- 3. Per-employee greeting overrides, one per language, so a company can
--    author its own pitch in each language rather than getting a generic
--    platform greeting. Additive alongside the existing single-language
--    first_message/welcome_message_language — those remain the fallback
--    for any language this map doesn't have an entry for, and the sole
--    behavior for a company that never sets this at all.
ALTER TABLE ai_agents
    ADD COLUMN IF NOT EXISTS greetings JSONB DEFAULT '{}'::jsonb;

-- 4. Which language a given call was actually conducted in — visitor-chosen,
--    anonymous (no visitor account exists to hang a preference off), so this
--    is the per-session record analytics and a human reviewing a transcript
--    need. NULL for any call that predates this migration.
ALTER TABLE conversations
    ADD COLUMN IF NOT EXISTS language VARCHAR(10);

CREATE INDEX IF NOT EXISTS idx_conversations_language
    ON conversations(company_id, language) WHERE language IS NOT NULL;
