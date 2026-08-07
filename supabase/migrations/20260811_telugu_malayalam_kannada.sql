-- Extends the platform language catalog (migration 20260810) from three
-- languages to six: Telugu, Malayalam, Kannada. Purely additive — inserts
-- three rows into the existing `languages` table, no schema change.
--
-- speech_locale is intentionally NULL for Telugu and Malayalam: Deepgram
-- (the transcriber this platform uses for en/ta/hi/kn) does not support
-- either language at all — confirmed by reading the installed
-- @vapi-ai/web SDK's own transcriber type definitions, not assumed. Azure's
-- transcriber does support both ('te-IN'/'ml-IN'), which is what the
-- application code falls back to — but only once Azure Speech is actually
-- linked as a provider key in Vapi's dashboard, which this migration (and
-- this app generally) has no way to verify. Until then, calls in these two
-- languages omit the transcriber override entirely rather than request a
-- provider that isn't configured.

-- speech_locale was NOT NULL in the original migration, written before any
-- language lacked Deepgram support. Telugu/Malayalam are a genuinely new
-- case — "no confirmed transcriber locale" — not a data-entry omission, so
-- the column needs to actually allow it rather than being worked around
-- with a misleading placeholder value.
ALTER TABLE languages ALTER COLUMN speech_locale DROP NOT NULL;

INSERT INTO languages (code, name, native_name, is_active, is_default, speech_locale, tts_provider, voice_model, is_rtl, display_order)
VALUES
    ('te', 'Telugu', 'తెలుగు', TRUE, FALSE, NULL, 'openai', 'nova', FALSE, 4),
    ('ml', 'Malayalam', 'മലയാളം', TRUE, FALSE, NULL, 'openai', 'nova', FALSE, 5),
    ('kn', 'Kannada', 'ಕನ್ನಡ', TRUE, FALSE, 'kn', 'openai', 'nova', FALSE, 6)
ON CONFLICT (code) DO NOTHING;
