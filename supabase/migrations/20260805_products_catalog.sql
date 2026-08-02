-- Products catalog columns for the Products Management module.
--
-- Purely additive: every existing row stays valid and visible. is_active
-- defaults TRUE so products already seeded keep appearing on the public card
-- and in voice-tool searches the moment this applies — deactivation is an
-- explicit admin action, never a migration side effect.

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

-- Slug is unique per company, not globally — two tenants can both sell a
-- "starter-plan". Partial on deleted_at so a soft-deleted product frees its
-- slug for reuse instead of blocking it forever.
CREATE UNIQUE INDEX IF NOT EXISTS idx_products_company_slug
    ON products(company_id, slug)
    WHERE slug IS NOT NULL AND deleted_at IS NULL;

-- The public card and prompt assembly read active products in display order
-- on every card load and every call start.
CREATE INDEX IF NOT EXISTS idx_products_company_active_order
    ON products(company_id, display_order, created_at)
    WHERE deleted_at IS NULL AND is_active = TRUE;
