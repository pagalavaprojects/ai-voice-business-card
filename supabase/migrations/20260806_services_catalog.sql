-- Services catalog columns for the Services Management module.
--
-- Mirrors 20260805 (products), with two deliberate differences:
--
--   * DURATION reuses the existing `timeline` column rather than adding a
--     second one. `timeline VARCHAR(100)` already carries "2-6 weeks to first
--     automation live" for every seeded service and is already read by the
--     public card, prompt assembly and the search_services voice tool. A new
--     `duration` column would have split one concept across two fields and
--     left every existing row's value stranded in the old one.
--
--   * `services` has a `price` column where products have `pricing`, and no
--     currency at all — so currency is added here to match how the card
--     renders product pricing.
--
-- Purely additive; is_active defaults TRUE so services already seeded stay
-- visible the moment this applies. Deactivation is an explicit admin action.

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

-- Slug is unique per company, not globally — two tenants can both offer
-- "onboarding". Partial on deleted_at so a soft-deleted service frees its slug
-- for reuse rather than blocking it forever.
CREATE UNIQUE INDEX IF NOT EXISTS idx_services_company_slug
    ON services(company_id, slug)
    WHERE slug IS NOT NULL AND deleted_at IS NULL;

-- The public card and prompt assembly read active services in display order
-- on every card load and every call start.
CREATE INDEX IF NOT EXISTS idx_services_company_active_order
    ON services(company_id, display_order, created_at)
    WHERE deleted_at IS NULL AND is_active = TRUE;
