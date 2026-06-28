-- =========================================================
-- 004_shop_suspension.sql
-- Path: database/migrations/004_shop_suspension.sql
--
-- PURPOSE
--   Adds platform-admin "lock shop" capability (Tier 1 admin
--   feature). Distinct from is_deleted:
--     - is_deleted   -> soft-deleted, hidden from owner, recoverable by admin only
--     - is_suspended -> still owned/visible to the owner, but ALL
--                        operational access (dashboard, POS, kitchen,
--                        QR ordering) is blocked until admin lifts it.
--   Use case: non-payment, abuse report, policy violation — owner
--   should see *why* they're locked out, not just vanish like a delete.
-- =========================================================

ALTER TABLE shops
  ADD COLUMN is_suspended     BOOLEAN     NOT NULL DEFAULT FALSE,
  ADD COLUMN suspended_reason VARCHAR(255),
  ADD COLUMN suspended_at     TIMESTAMPTZ;

-- Partial index: only suspended shops, since that's the rare case
-- we'll filter on (admin list view, membership-check hot path).
CREATE INDEX idx_shops_suspended ON shops(id) WHERE is_suspended = true;