-- =========================================================
-- 002_product_categories.sql
-- Path: database/migrations/002_product_categories.sql
--
-- Adds a product_categories table and a category_id FK
-- on product_models. All changes are ADDITIVE — no existing
-- data is touched. Existing products get category_id = NULL
-- (Uncategorised) until the shop owner assigns them.
--
-- Run:
--   docker exec -i minipos-postgres psql -U minipos_user -d minipos \
--     < database/migrations/002_product_categories.sql
-- =========================================================

BEGIN;

-- ── 1. Create product_categories ─────────────────────────
--
-- Each shop owns its own categories.
-- sort_order: lower = appears first in the POS sidebar.
-- color: hex string (e.g. "#0D7A5F"). Used in POS sidebar
--        and category management UI. Optional.
-- image_url: reserved for when image upload is added.
--            Nullable for now — not shown in UI yet.
-- is_deleted: soft delete so category names survive in
--             historical audit logs.

CREATE TABLE IF NOT EXISTS product_categories (
  id          UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  shop_id     UUID          NOT NULL REFERENCES shops(id) ON DELETE CASCADE,

  name        VARCHAR(100)  NOT NULL,
  color       VARCHAR(7),                 -- hex colour, e.g. "#0D7A5F"
  image_url   TEXT,                       -- reserved for future image upload

  sort_order  SMALLINT      NOT NULL DEFAULT 0,
  is_deleted  BOOLEAN       NOT NULL DEFAULT FALSE,

  created_at  TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_product_categories_shop
  ON product_categories(shop_id)
  WHERE is_deleted = FALSE;

-- Auto-update updated_at on every row change
CREATE OR REPLACE TRIGGER trg_product_categories_updated_at
  BEFORE UPDATE ON product_categories
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ── 2. Add category_id to product_models ─────────────────
--
-- Nullable FK — existing products are "Uncategorised" until
-- the owner assigns them. ON DELETE SET NULL means deleting
-- a category uncategorises its products rather than deleting them.

ALTER TABLE product_models
  ADD COLUMN IF NOT EXISTS category_id UUID
    REFERENCES product_categories(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_product_models_category
  ON product_models(category_id)
  WHERE is_deleted = FALSE;


-- ── 3. Verification ───────────────────────────────────────

DO $$
BEGIN
  ASSERT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'product_categories'
  ), 'product_categories table not created';

  ASSERT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'product_models'
      AND column_name = 'category_id'
  ), 'category_id column not added to product_models';

  RAISE NOTICE 'Migration 002_product_categories: OK';
END $$;

COMMIT;