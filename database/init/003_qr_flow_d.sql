-- ── 1. Add CLOSING to order_status enum ──────────────────
-- Must run OUTSIDE a transaction block.
-- IF NOT EXISTS guard makes it safe to re-run.
ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'CLOSING' AFTER 'CONFIRMED';

-- Add ticket_id to order_items so each item knows which kitchen round it belongs to
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS ticket_id UUID REFERENCES kitchen_tickets(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_order_items_ticket ON order_items(ticket_id);

-- ── 2–4. Everything else inside a transaction ─────────────
BEGIN;

-- ── 2. Add bill request tracking to orders ───────────────
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS bill_requested    BOOLEAN     NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS bill_requested_at TIMESTAMPTZ;

-- Index: cashier POS query — "show me all tables requesting payment"
CREATE INDEX IF NOT EXISTS idx_orders_bill_requested
  ON orders(shop_id, bill_requested)
  WHERE bill_requested = TRUE;


-- ── 3. Add round + is_addon to kitchen_tickets ───────────
-- round:    1 = first order at this table sitting, 2 = second round, etc.
--           The number is stored for analytics but not shown to the chef.
-- is_addon: TRUE when round > 1 — triggers the ADD-ON badge
--           on the kitchen display so the chef knows it is
--           a mid-meal addition and can prioritise accordingly.
ALTER TABLE kitchen_tickets
  ADD COLUMN IF NOT EXISTS round    INT     NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS is_addon BOOLEAN NOT NULL DEFAULT FALSE;


-- ── 4. Remove the UNIQUE constraint on kitchen_tickets ───
-- The old constraint UNIQUE(shop_id, order_id) prevents
-- multiple tickets per order, which is exactly what Flow D
-- needs — one discrete ticket per round of ordering.
-- Replaced with a non-unique index for query performance.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'kitchen_tickets_shop_id_order_id_key'
      AND conrelid = 'kitchen_tickets'::regclass
  ) THEN
    ALTER TABLE kitchen_tickets
      DROP CONSTRAINT kitchen_tickets_shop_id_order_id_key;
  END IF;
END
$$;

-- Non-unique index — allows multiple tickets per order while
-- keeping queries like "all tickets for order X" fast.
CREATE INDEX IF NOT EXISTS idx_kitchen_tickets_order_round
  ON kitchen_tickets(order_id, round);


-- ── Verification ─────────────────────────────────────────
DO $$
BEGIN
  ASSERT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'bill_requested'
  ), 'bill_requested column missing from orders';

  ASSERT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'kitchen_tickets' AND column_name = 'round'
  ), 'round column missing from kitchen_tickets';

  ASSERT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'kitchen_tickets' AND column_name = 'is_addon'
  ), 'is_addon column missing from kitchen_tickets';

  ASSERT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'CLOSING'
      AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'order_status')
  ), 'CLOSING missing from order_status enum';

  RAISE NOTICE 'Migration 003_qr_flow_d: OK';
END $$;

COMMIT;