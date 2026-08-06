-- ============================================================================
-- PENDING PRODUCTION MIGRATIONS — paste into Supabase → SQL Editor
--
-- Run BLOCK 1 on its own first, then BLOCK 2.
--
-- Why split: ALTER TYPE ... ADD VALUE cannot have its new value USED in the
-- same transaction that adds it, and the SQL Editor wraps a run in one
-- transaction. Nothing in Block 2 uses 'REQUESTED', so one combined run would
-- very likely work — but splitting removes the question entirely for the cost
-- of one extra paste.
--
-- All seven are purely additive: no foreign keys, no triggers, no data
-- migration, no policy changes. Every existing row stays valid and visible
-- (is_active defaults TRUE).
--
-- Pre-flight checked against live data on 2026-08-03:
--   * conversations.vapi_call_id — 18 rows, 0 duplicates → UNIQUE index safe
--   * products / services        — all rows get slug NULL, and the slug index
--                                  is partial on slug IS NOT NULL → no conflict
-- ============================================================================


-- ════════════════════════════════════════════════════════════════════════════
-- BLOCK 1 — run this alone   (migration 20260803)
-- ════════════════════════════════════════════════════════════════════════════
-- Lets an appointment be captured without a confirmed calendar event, so the
-- voice assistant stops telling callers a meeting is confirmed when no invite
-- exists. NOTE: adding an enum value is irreversible in Postgres.

ALTER TYPE appointment_status ADD VALUE IF NOT EXISTS 'REQUESTED';


-- ════════════════════════════════════════════════════════════════════════════
-- BLOCK 2 — run after Block 1 succeeds   (migrations 20260804–20260809)
-- ════════════════════════════════════════════════════════════════════════════

-- ---- 20260804: hot-path indexes -------------------------------------------
-- vapi_call_id is queried on EVERY webhook (assistant-request, each tool call,
-- end-of-call) and is currently a sequential scan. UNIQUE also makes the
-- get-or-create safe under concurrent webhooks.
CREATE UNIQUE INDEX IF NOT EXISTS idx_conversations_vapi_call_id
    ON conversations(vapi_call_id)
    WHERE vapi_call_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_leads_conversation
    ON leads(conversation_id)
    WHERE conversation_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_appointments_lead_created
    ON appointments(lead_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_conversation_messages_conversation
    ON conversation_messages(conversation_id, created_at);


-- ---- 20260805: products catalog -------------------------------------------
ALTER TABLE products
    ADD COLUMN IF NOT EXISTS slug VARCHAR(160),
    ADD COLUMN IF NOT EXISTS short_description VARCHAR(280),
    ADD COLUMN IF NOT EXISTS category VARCHAR(80),
    ADD COLUMN IF NOT EXISTS discount_percent NUMERIC(5, 2) DEFAULT 0 NOT NULL,
    ADD COLUMN IF NOT EXISTS sku VARCHAR(64),
    ADD COLUMN IF NOT EXISTS image_path TEXT,
    ADD COLUMN IF NOT EXISTS gallery_paths JSONB DEFAULT '[]'::jsonb NOT NULL,
    ADD COLUMN IF NOT EXISTS cta_label VARCHAR(60),
    ADD COLUMN IF NOT EXISTS cta_url TEXT,
    ADD COLUMN IF NOT EXISTS display_order INT DEFAULT 0 NOT NULL,
    ADD COLUMN IF NOT EXISTS is_featured BOOLEAN DEFAULT FALSE NOT NULL,
    ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_products_company_slug
    ON products(company_id, slug)
    WHERE slug IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_products_company_active_order
    ON products(company_id, display_order, created_at)
    WHERE deleted_at IS NULL AND is_active = TRUE;


-- ---- 20260806: services catalog -------------------------------------------
-- Duration deliberately reuses the existing `timeline` column rather than
-- adding a second one.
ALTER TABLE services
    ADD COLUMN IF NOT EXISTS slug VARCHAR(160),
    ADD COLUMN IF NOT EXISTS short_description VARCHAR(280),
    ADD COLUMN IF NOT EXISTS category VARCHAR(80),
    ADD COLUMN IF NOT EXISTS currency VARCHAR(10) DEFAULT 'USD' NOT NULL,
    ADD COLUMN IF NOT EXISTS image_path TEXT,
    ADD COLUMN IF NOT EXISTS cta_label VARCHAR(60),
    ADD COLUMN IF NOT EXISTS cta_url TEXT,
    ADD COLUMN IF NOT EXISTS display_order INT DEFAULT 0 NOT NULL,
    ADD COLUMN IF NOT EXISTS is_featured BOOLEAN DEFAULT FALSE NOT NULL,
    ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_services_company_slug
    ON services(company_id, slug)
    WHERE slug IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_services_company_active_order
    ON services(company_id, display_order, created_at)
    WHERE deleted_at IS NULL AND is_active = TRUE;


-- ---- 20260807: employee management -----------------------------------------
-- Deliberately kept OFF the public critical path. The business card reads
-- name / designation / email / phone / office_address / working_hours, all of
-- which already exist, and the new code treats a missing is_active as "no
-- opinion" rather than "disabled" — so shipping this module before the
-- migration applies cannot blank a card, which is exactly how the catalog
-- release degraded production.
ALTER TABLE employees
    -- Enable/disable without deleting: a departed employee's card should stop
    -- answering while their conversation history stays intact for reporting.
    ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE NOT NULL,
    ADD COLUMN IF NOT EXISTS avatar_path TEXT,
    -- Per-employee overrides. NULL means "inherit the company/agent default",
    -- which is why these are nullable rather than defaulted — a stored copy of
    -- the shared value would silently stop tracking later changes to it.
    ADD COLUMN IF NOT EXISTS voice_id VARCHAR(40),
    ADD COLUMN IF NOT EXISTS prompt_override TEXT,
    ADD COLUMN IF NOT EXISTS timezone VARCHAR(64),
    ADD COLUMN IF NOT EXISTS display_order INT DEFAULT 0 NOT NULL;

CREATE INDEX IF NOT EXISTS idx_employees_company_active
    ON employees(company_id, display_order, created_at)
    WHERE deleted_at IS NULL;

-- One employee row per linked auth user per company. Partial so the many
-- employees with no user_id (card-only, never invited) don't collide, and so a
-- soft-deleted row frees the link for re-invitation.
CREATE UNIQUE INDEX IF NOT EXISTS idx_employees_company_user
    ON employees(company_id, user_id)
    WHERE user_id IS NOT NULL AND deleted_at IS NULL;


-- ---- 20260808: employee public URL slug -------------------------------------
-- Short, printable card links (/c/{slug}). Global namespace, not per-company —
-- unlike the product/service slugs above, two different companies cannot both
-- claim /c/founder. Absence is treated as "no short link set", never an
-- error: the permanent /{companyId}/{employeeId} URL is unaffected either way.
ALTER TABLE employees
    ADD COLUMN IF NOT EXISTS slug VARCHAR(80);

CREATE UNIQUE INDEX IF NOT EXISTS idx_employees_slug_global
    ON employees(slug)
    WHERE slug IS NOT NULL AND deleted_at IS NULL;


-- ---- 20260809: agent welcome-message language tag ---------------------------
-- Purely descriptive metadata — nothing reads this column to decide behavior,
-- it only lets an admin (or a future language picker) know what language
-- ai_agents.first_message is currently written in.
ALTER TABLE ai_agents
    ADD COLUMN IF NOT EXISTS welcome_message_language VARCHAR(10) DEFAULT 'en' NOT NULL;

-- ============================================================================
-- Expected result: "Success. No rows returned" for each block.
-- Then tell Claude Code, which will verify the schema, remove the compatibility
-- fallback, run the gates, deploy and verify production end to end.
-- ============================================================================
