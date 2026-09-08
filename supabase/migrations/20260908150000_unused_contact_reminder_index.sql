-- ============================================================
-- Item 15 — 2-day unused-contact reminder: sweep index
-- ============================================================
-- The daily cron sweep reads leads that are still NEW/QUALIFIED, not
-- deleted, and were created inside a 48h–120h window. A partial index on
-- exactly that predicate keeps the sweep an index range scan as the leads
-- table grows (the statuses covered are the only ones the sweep reads).
-- Additive and idempotent: no data change, no dependency on other pending
-- migrations.

CREATE INDEX IF NOT EXISTS idx_leads_unused_contact_sweep
    ON leads (created_at)
    WHERE status IN ('NEW', 'QUALIFIED') AND deleted_at IS NULL;
