-- Employee Management module columns.
--
-- Deliberately kept OFF the public critical path. The business card reads
-- name / designation / email / phone / office_address / working_hours, all of
-- which already exist — so deploying this module before the migration applies
-- cannot blank the card or null the assembled prompt, which is exactly how the
-- catalog release degraded production. Every column below is admin-facing or
-- an optional enhancement.
--
-- Purely additive. is_active defaults TRUE so existing employees stay live.

ALTER TABLE employees
    -- Enable/disable without deleting: a departed employee's card should stop
    -- answering while their conversation history stays intact for reporting.
    ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE NOT NULL,
    ADD COLUMN IF NOT EXISTS avatar_path TEXT,
    -- Per-employee overrides. NULL means "inherit the company default", which
    -- is why these are nullable rather than defaulted — a stored copy of the
    -- company value would silently stop tracking later changes to it.
    ADD COLUMN IF NOT EXISTS voice_id VARCHAR(40),
    ADD COLUMN IF NOT EXISTS prompt_override TEXT,
    ADD COLUMN IF NOT EXISTS timezone VARCHAR(64),
    ADD COLUMN IF NOT EXISTS display_order INT DEFAULT 0 NOT NULL;

-- The employee list is scoped per company and ordered for display.
CREATE INDEX IF NOT EXISTS idx_employees_company_active
    ON employees(company_id, display_order, created_at)
    WHERE deleted_at IS NULL;

-- One employee row per linked auth user per company. Partial so the many
-- employees with no user_id (card-only, never invited) don't collide, and so a
-- soft-deleted row frees the link for re-invitation.
CREATE UNIQUE INDEX IF NOT EXISTS idx_employees_company_user
    ON employees(company_id, user_id)
    WHERE user_id IS NOT NULL AND deleted_at IS NULL;
