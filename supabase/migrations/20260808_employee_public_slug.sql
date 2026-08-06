-- Short public URL slugs for the voice business card (e.g. /c/srinivasan
-- instead of /{companyId}/{employeeId}), so a card is short enough to print
-- and share.
--
-- Deliberately kept OFF the public critical path, same as 20260807: the card
-- and prompt assembly both read name/designation/email/phone/etc, none of
-- which are touched here. Every read of this column tolerates its absence
-- (resolveSlug returns "not found" rather than erroring), so the short-URL
-- route is simply unavailable — not broken — until this applies. The long
-- /{companyId}/{employeeId} URL is completely unaffected either way.
--
-- Unique GLOBALLY, not per company: unlike products/services (which live
-- under their own tenant's dashboard and only need company-scoped
-- uniqueness), a public card slug is a single flat namespace shared by every
-- tenant — two companies cannot both claim /c/founder.

ALTER TABLE employees
    ADD COLUMN IF NOT EXISTS slug VARCHAR(80);

CREATE UNIQUE INDEX IF NOT EXISTS idx_employees_slug_global
    ON employees(slug)
    WHERE slug IS NOT NULL AND deleted_at IS NULL;
