-- =========================================================
-- MiniPOS Database Schema — Production
-- =========================================================
-- Multi-tenant POS supporting:
--   • Retail POS
--   • Restaurant POS (dine-in, takeaway, QR ordering)
--   • Simple online shop / delivery
--
-- All shops share one database, isolated by shop_id.
-- =========================================================


-- =========================================================
-- EXTENSIONS
-- =========================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pgcrypto;


-- =========================================================
-- ENUM DEFINITIONS
-- =========================================================

CREATE TYPE user_role        AS ENUM ('ADMIN', 'USER');
CREATE TYPE user_status      AS ENUM ('ACTIVE', 'SUSPENDED');

CREATE TYPE shop_type        AS ENUM ('RETAIL', 'RESTAURANT', 'ONLINE_SHOP');
CREATE TYPE shop_role        AS ENUM ('OWNER', 'MANAGER', 'CASHIER');

CREATE TYPE order_type       AS ENUM ('RETAIL', 'DINE_IN', 'TAKEAWAY', 'QR', 'DELIVERY', 'PICKUP', 'ONLINE');
CREATE TYPE order_status     AS ENUM ('OPEN', 'CONFIRMED', 'PAID', 'CANCELLED', 'REFUNDED');
CREATE TYPE order_item_status AS ENUM ('ACTIVE', 'CANCELLED', 'REFUNDED');

CREATE TYPE inventory_movement_type AS ENUM ('SALE', 'PURCHASE', 'ADJUSTMENT', 'REFUND');

CREATE TYPE payment_method   AS ENUM ('CASH', 'COD');
CREATE TYPE payment_status   AS ENUM ('PENDING', 'PAID', 'FAILED', 'REFUNDED', 'PARTIALLY_REFUNDED');

CREATE TYPE currency         AS ENUM ('USD', 'SGD', 'THB', 'MMK', 'EUR');

CREATE TYPE device_status    AS ENUM ('PENDING', 'APPROVED', 'REVOKED');


-- =========================================================
-- updated_at TRIGGER FUNCTION
-- =========================================================
-- Reusable trigger that keeps updated_at in sync automatically.
-- Attach to any table that has an updated_at column.
-- =========================================================

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


-- =========================================================
-- USERS
-- =========================================================
-- Platform-level accounts. A single user can own or work
-- at multiple shops simultaneously.
--
-- password_hash    — bcrypt hash (min cost 12 recommended).
-- token_version    — increment to invalidate all active JWTs
--                    for a user without a token blacklist.
-- failed_attempts  — brute-force counter; reset on success.
-- locked_until     — NULL = not locked. Set by app layer
--                    after N consecutive failures.
-- is_deleted       — soft delete; email freed via partial index.
-- =========================================================

CREATE TABLE users (
  id               UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  name             VARCHAR(100) NOT NULL,
  email            VARCHAR(150) NOT NULL,

  password_hash    TEXT        NOT NULL,

  role             user_role   NOT NULL,
  status           user_status NOT NULL DEFAULT 'ACTIVE',

  token_version    INTEGER     NOT NULL DEFAULT 0,

  failed_attempts  SMALLINT    NOT NULL DEFAULT 0,
  locked_until     TIMESTAMPTZ,

  is_deleted       BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Case-insensitive unique email across ALL users, including soft-deleted ones.
-- Email is permanently reserved. A deleted account must be reactivated,
-- not re-registered. This also prevents someone from claiming a previously
-- deleted admin's email address.
CREATE UNIQUE INDEX idx_users_email
  ON users (LOWER(email));

CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- =========================================================
-- SHOPS
-- =========================================================
-- Each shop is an independent business on the platform.
-- owner_id always maps to a shop_users row with role=OWNER.
--
-- tax_rate         — shop-wide default tax percentage (0–100).
--                    Store as NUMERIC to avoid float drift.
-- timezone         — IANA timezone string used for
--                    order_no generation and reporting.
-- =========================================================

CREATE TABLE shops (
  id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_id    UUID        NOT NULL REFERENCES users(id),

  name        VARCHAR(120) NOT NULL,
  shop_type   shop_type   NOT NULL,
  currency    currency    NOT NULL,

  tax_rate    NUMERIC(5,2) NOT NULL DEFAULT 0
              CHECK (tax_rate >= 0 AND tax_rate <= 100),
  timezone    VARCHAR(60)  NOT NULL DEFAULT 'UTC',

  pin_max_attempts SMALLINT     NOT NULL DEFAULT 5
                   CHECK (pin_max_attempts >= 1 AND pin_max_attempts <= 10),

  is_deleted  BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_shops_owner ON shops(owner_id);

CREATE TRIGGER trg_shops_updated_at
  BEFORE UPDATE ON shops
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- =========================================================
-- SHOP DEVICES
-- =========================================================
-- Tracks every device that has ever attempted to access a
-- shop. New devices start as PENDING and must be APPROVED
-- by an OWNER or MANAGER before they can process orders.
--
-- device_key       — random token generated on first install
--                    (UUID v4 or 32-byte hex).
-- approved_by      — user who approved / revoked the device.
-- last_seen_at     — updated on every authenticated request.
-- =========================================================

CREATE TABLE shop_devices (
  id            UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  shop_id       UUID          NOT NULL REFERENCES shops(id) ON DELETE CASCADE,

  device_name   VARCHAR(100),
  device_key    VARCHAR(100)  NOT NULL UNIQUE,

  status        device_status NOT NULL DEFAULT 'PENDING',
  approved_by   UUID          REFERENCES users(id) ON DELETE SET NULL,

  user_agent    TEXT,
  ip_address    INET,

  last_seen_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE INDEX idx_shop_devices_shop   ON shop_devices(shop_id);
CREATE INDEX idx_shop_devices_key    ON shop_devices(device_key);
CREATE INDEX idx_shop_devices_status ON shop_devices(shop_id, status);


-- =========================================================
-- SHOP USERS
-- =========================================================
-- Staff membership per shop. A user may hold a different
-- role in each shop they belong to.
-- =========================================================

CREATE TABLE shop_users (
  id         UUID       PRIMARY KEY DEFAULT uuid_generate_v4(),
  shop_id    UUID       NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  user_id    UUID       NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  pin_hash   VARCHAR(255),
  pin_attempts      SMALLINT    NOT NULL    DEFAULT 0 CHECK (pin_attempts >= 0),
  pin_locked_until  TIMESTAMPTZ,

  role       shop_role  NOT NULL,
  is_active  BOOLEAN    NOT NULL DEFAULT TRUE,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (shop_id, user_id)
);

CREATE INDEX idx_shop_users_shop ON shop_users(shop_id);
CREATE INDEX idx_shop_users_user ON shop_users(user_id);


-- =========================================================
-- RESTAURANT TABLES
-- =========================================================
-- Physical dining tables. Only meaningful for RESTAURANT
-- shops but the schema is not enforced at DB level so a
-- future shop_type can reuse the concept.
--
-- qr_token         — rotated periodically by the app; the
--                    UNIQUE constraint prevents collisions.
-- capacity         — optional seat count for floor planning.
-- =========================================================

CREATE TABLE restaurant_tables (
  id           UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  shop_id      UUID        NOT NULL REFERENCES shops(id) ON DELETE CASCADE,

  table_number VARCHAR(20) NOT NULL,
  capacity     SMALLINT    CHECK (capacity > 0),

  qr_token     VARCHAR(100) NOT NULL UNIQUE,
  is_active    BOOLEAN     NOT NULL DEFAULT TRUE,

  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (shop_id, table_number)
);

CREATE INDEX idx_restaurant_tables_shop ON restaurant_tables(shop_id);


-- =========================================================
-- PRODUCT MODELS
-- =========================================================
-- The canonical identity of a product (brand, name, image).
-- One model can have many sellable items (sizes, colours).
--
-- Example:  "Coca-Cola" is a model.
--           "Coca-Cola 330ml" and "Coca-Cola 1L" are items.
-- =========================================================

CREATE TABLE product_models (
  id          UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  shop_id     UUID         NOT NULL REFERENCES shops(id) ON DELETE CASCADE,

  name        VARCHAR(150) NOT NULL,
  description TEXT,
  image_url   TEXT,

  is_active   BOOLEAN      NOT NULL DEFAULT TRUE,
  is_deleted  BOOLEAN      NOT NULL DEFAULT FALSE,

  created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX idx_product_models_shop        ON product_models(shop_id);
CREATE INDEX idx_product_models_shop_active ON product_models(shop_id, is_active)
  WHERE is_deleted = FALSE;

CREATE TRIGGER trg_product_models_updated_at
  BEFORE UPDATE ON product_models
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- =========================================================
-- PRODUCT ITEMS
-- =========================================================
-- The actual SKU that gets scanned and sold.
-- A model always has at least one item.
--
-- track_stock      — FALSE for restaurants (food is made
--                    to order; no physical stock to track).
-- stock_qty        — only meaningful when track_stock=TRUE.
--                    Protected against negative values by
--                    a CHECK constraint AND a serialised
--                    UPDATE in application code
--                    (SELECT ... FOR UPDATE).
-- is_sold_out      — manual override for restaurants when
--                    an item is temporarily unavailable.
-- cost_price       — used for profit margin reporting.
-- =========================================================

CREATE TABLE product_items (
  id               UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_model_id UUID          NOT NULL REFERENCES product_models(id) ON DELETE CASCADE,

  name             VARCHAR(100)  NOT NULL,

  sku              VARCHAR(100),
  barcode          VARCHAR(50),

  price            DECIMAL(10,2) NOT NULL CHECK (price >= 0),
  cost_price       DECIMAL(10,2)          CHECK (cost_price >= 0),

  track_stock      BOOLEAN       NOT NULL DEFAULT TRUE,
  stock_qty        INTEGER       NOT NULL DEFAULT 0 CHECK (stock_qty >= 0),

  is_active        BOOLEAN       NOT NULL DEFAULT TRUE,
  is_sold_out      BOOLEAN       NOT NULL DEFAULT FALSE,

  created_at       TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ   NOT NULL DEFAULT now()
);

-- Barcode must be globally unique across all items (not just per shop).
-- A shop-scoped unique index lives on product_models.shop_id JOIN.
-- Global uniqueness prevents cross-shop barcode scanning bugs.
CREATE UNIQUE INDEX idx_product_items_barcode
  ON product_items(barcode)
  WHERE barcode IS NOT NULL;

CREATE INDEX idx_product_items_model  ON product_items(product_model_id);
CREATE INDEX idx_product_items_active ON product_items(product_model_id, is_active);

CREATE TRIGGER trg_product_items_updated_at
  BEFORE UPDATE ON product_items
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- =========================================================
-- MODIFIER GROUPS
-- =========================================================
-- A named set of customisation options attached to a model.
-- Examples: "Spice Level", "Add-ons", "Cooking Preference".
--
-- min_select / max_select — validated by CHECK; app layer
-- enforces them at order time.
-- =========================================================

CREATE TABLE modifier_groups (
  id          UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  shop_id     UUID         NOT NULL REFERENCES shops(id) ON DELETE CASCADE,

  name        VARCHAR(100) NOT NULL,

  is_required BOOLEAN      NOT NULL DEFAULT FALSE,
  min_select  SMALLINT     NOT NULL DEFAULT 0 CHECK (min_select >= 0),
  max_select  SMALLINT     NOT NULL DEFAULT 1
              CHECK (max_select >= min_select),

  sort_order  SMALLINT     NOT NULL DEFAULT 0,
  is_deleted  BOOLEAN      NOT NULL DEFAULT FALSE,

  created_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX idx_modifier_groups_shop ON modifier_groups(shop_id);

-- =========================================================
-- PRODUCT-MODIFIER JOIN TABLE
-- =========================================================
-- Many-to-many relationship between product models and modifier groups.
-- A product model can have multiple modifier groups (e.g. "Burger"
-- has "Cooking Preference" and "Add-ons"). A modifier group can apply
-- to multiple product models (e.g. "Cooking Preference" applies to both
-- "Burger" and "Steak").
-- =========================================================

CREATE TABLE product_model_modifier_groups (
  product_model_id  UUID NOT NULL REFERENCES product_models(id) ON DELETE CASCADE,
  modifier_group_id UUID NOT NULL REFERENCES modifier_groups(id) ON DELETE CASCADE,

  PRIMARY KEY (product_model_id, modifier_group_id)
);


-- =========================================================
-- MODIFIER OPTIONS
-- =========================================================
-- Individual choices within a modifier group.
-- Example: group "Add-ons" → options "Extra Egg (+15)", "Cheese (+20)".
--
-- linked_product_item_id — optional: ties this option to a
--   real product item so its stock is decremented on sale
--   (e.g. "Add Fried Egg" deducts from the Egg SKU).
--
-- price_delta      — can be negative (discount modifiers).
-- =========================================================

CREATE TABLE modifier_options (
  id                     UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  group_id               UUID          NOT NULL REFERENCES modifier_groups(id) ON DELETE CASCADE,

  name                   VARCHAR(100)  NOT NULL,
  price_delta            DECIMAL(10,2) NOT NULL DEFAULT 0,

  linked_product_item_id UUID          REFERENCES product_items(id) ON DELETE SET NULL,

  is_active              BOOLEAN       NOT NULL DEFAULT TRUE,
  sort_order             SMALLINT      NOT NULL DEFAULT 0,

  created_at             TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE INDEX idx_modifier_options_group ON modifier_options(group_id);


-- =========================================================
-- INVENTORY MOVEMENTS
-- =========================================================
-- Append-only ledger of every stock change.
-- The current stock_qty on product_items is the running
-- total; this table is the audit trail behind it.
--
-- quantity         — positive = stock in, negative = stock out.
--                    CHECK (quantity <> 0) prevents no-ops.
-- reference_id     — FK-like pointer to the causative entity
--                    (e.g. order_items.id for a SALE).
--                    Not a hard FK so historical rows survive
--                    if the order is hard-deleted.
-- notes            — optional human reason for ADJUSTMENT.
-- =========================================================

CREATE TABLE inventory_movements (
  id              UUID                    PRIMARY KEY DEFAULT uuid_generate_v4(),
  shop_id         UUID                    NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  product_item_id UUID                    NOT NULL REFERENCES product_items(id) ON DELETE CASCADE,

  type            inventory_movement_type NOT NULL,
  quantity        INTEGER                 NOT NULL CHECK (quantity <> 0),

  reference_id    UUID,
  notes           TEXT,

  created_by      UUID                    REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ             NOT NULL DEFAULT now()
);

CREATE INDEX idx_inventory_item       ON inventory_movements(product_item_id);
CREATE INDEX idx_inventory_shop_type  ON inventory_movements(shop_id, type);
CREATE INDEX idx_inventory_created_at ON inventory_movements(shop_id, created_at);


-- =========================================================
-- ORDERS
-- =========================================================
-- A transaction between the shop and a customer.
--
-- order_no         — human-readable reference generated by
--                    the app (e.g. "ORD-20240318-0042").
--                    Unique per shop only.
-- cancelled_at /
-- completed_at     — explicit timestamps for fast reporting
--                    queries that filter by lifecycle stage.
-- notes            — internal cashier notes.
--
-- CONSTRAINT dinein_requires_table — DINE_IN orders must
--   always reference a table. Restored from v1.
-- =========================================================

CREATE TABLE orders (
  id               UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  shop_id          UUID          NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  cashier_id       UUID          REFERENCES users(id) ON DELETE SET NULL,

  order_no         VARCHAR(30)   NOT NULL,
  order_type       order_type    NOT NULL,

  table_id         UUID          REFERENCES restaurant_tables(id) ON DELETE SET NULL,

  subtotal         DECIMAL(12,2) NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
  tax_amount       DECIMAL(12,2) NOT NULL DEFAULT 0 CHECK (tax_amount >= 0),
  discount_amount  DECIMAL(12,2) NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
  total_amount     DECIMAL(12,2) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),

  status           order_status  NOT NULL DEFAULT 'OPEN',

  customer_name    VARCHAR(150),
  customer_phone   VARCHAR(50),
  delivery_address TEXT,
  delivery_note    TEXT,
  notes            TEXT,

  cancelled_at     TIMESTAMPTZ,
  completed_at     TIMESTAMPTZ,

  created_at       TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ   NOT NULL DEFAULT now(),

  UNIQUE (shop_id, order_no),

  CONSTRAINT dinein_requires_table CHECK (
    (order_type = 'DINE_IN' AND table_id IS NOT NULL)
    OR
    (order_type <> 'DINE_IN')
  ),

  CONSTRAINT total_equals_subtotal_plus_tax_minus_discount CHECK (
    total_amount = subtotal + tax_amount - discount_amount
  )
);

CREATE INDEX idx_orders_shop         ON orders(shop_id);
CREATE INDEX idx_orders_cashier      ON orders(cashier_id);
CREATE INDEX idx_orders_status       ON orders(shop_id, status);
CREATE INDEX idx_orders_shop_created ON orders(shop_id, created_at DESC);
CREATE INDEX idx_orders_updated      ON orders(shop_id, updated_at DESC);
CREATE INDEX idx_orders_table        ON orders(table_id) WHERE table_id IS NOT NULL;

CREATE TRIGGER trg_orders_updated_at
  BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- =========================================================
-- ORDER ITEMS
-- =========================================================
-- Line items within an order. Snapshot fields capture the
-- state of the product at sale time so historical orders
-- remain accurate after repricing or renaming.
--
-- product_item_id  — SET NULL on delete; snapshot fields
--                    preserve legibility even if the item
--                    is later soft-deleted.
-- modifier_snapshot — JSONB array of the selected modifier
--                     names and price_deltas at sale time.
-- =========================================================

CREATE TABLE order_items (
  id                      UUID             PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id                UUID             NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_item_id         UUID             REFERENCES product_items(id) ON DELETE SET NULL,

  product_name_snapshot   VARCHAR(255)     NOT NULL,
  item_name_snapshot      VARCHAR(255)     NOT NULL,
  unit_price_snapshot     DECIMAL(12,2)    NOT NULL CHECK (unit_price_snapshot >= 0),

  qty                     INTEGER          NOT NULL CHECK (qty > 0),
  subtotal                DECIMAL(12,2)    NOT NULL CHECK (subtotal >= 0),

  modifier_snapshot       JSONB            NOT NULL DEFAULT '[]',
  
  item_note               VARCHAR(255),
  
  status                  order_item_status NOT NULL DEFAULT 'ACTIVE',
  
  refunded_qty            INTEGER           NOT NULL DEFAULT 0 CHECK (refunded_qty >= 0),

  created_at              TIMESTAMPTZ      NOT NULL DEFAULT now(),

  CONSTRAINT chk_refunded_qty_lte_qty CHECK (refunded_qty <= qty)
);

CREATE INDEX idx_order_items_order        ON order_items(order_id);
CREATE INDEX idx_order_items_product_item ON order_items(product_item_id)
  WHERE product_item_id IS NOT NULL;


-- =========================================================
-- PAYMENTS
-- =========================================================
-- Financial transactions that settle an order.
-- Supports split payments (multiple rows per order).
--
-- received_amount  — what the customer physically handed
--                    over (for CASH; enables change calc).
-- change_amount    — computed change returned to customer.
-- =========================================================

CREATE TABLE payments (
  id               UUID           PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id         UUID           NOT NULL REFERENCES orders(id) ON DELETE CASCADE,

  method           payment_method NOT NULL,
  amount           DECIMAL(12,2)  NOT NULL CHECK (amount >= 0),
  received_amount  DECIMAL(12,2)           CHECK (received_amount >= 0),
  change_amount    DECIMAL(12,2)           CHECK (change_amount >= 0),

  status           payment_status NOT NULL DEFAULT 'PENDING',

  transaction_ref  VARCHAR(100),
  note             TEXT,

  paid_at          TIMESTAMPTZ,
  created_at       TIMESTAMPTZ    NOT NULL DEFAULT now(),

  CONSTRAINT cash_received_required CHECK (
    method <> 'CASH' OR received_amount IS NOT NULL
  )
);

CREATE INDEX idx_payments_order  ON payments(order_id);
CREATE INDEX idx_payments_status ON payments(status);


-- =========================================================
-- REFUNDS
-- =========================================================
-- Records full or partial refunds against a payment.
-- idempotency_key   — unique token from app layer to prevent
--                    double refunds on retries.
-- processed_by     — the staff member who actioned the refund.
-- =========================================================

CREATE TABLE refunds (
  id           UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id     UUID          NOT NULL REFERENCES orders(id),
  payment_id   UUID          REFERENCES payments(id) ON DELETE SET NULL,

  amount       DECIMAL(12,2) NOT NULL CHECK (amount > 0),
  reason       TEXT,

  idempotency_key VARCHAR(100) UNIQUE,
  processed_by UUID          REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE INDEX idx_refunds_order   ON refunds(order_id);
CREATE INDEX idx_refunds_payment ON refunds(payment_id) WHERE payment_id IS NOT NULL;
CREATE INDEX idx_refunds_order_amount ON refunds(order_id, amount);
CREATE INDEX idx_refunds_order_created ON refunds(order_id, created_at DESC);
CREATE INDEX idx_refunds_idempotency ON refunds(idempotency_key) WHERE idempotency_key IS NOT NULL;
-- =========================================================
-- AUDIT LOGS
-- =========================================================
-- Immutable event log. Rows are never updated or deleted.
-- ip_address       — request origin for security audits.
-- old_values /
-- new_values       — JSONB snapshots of changed columns.
-- =========================================================

CREATE TABLE audit_logs (
  id          UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  shop_id     UUID         REFERENCES shops(id) ON DELETE SET NULL,
  user_id     UUID         REFERENCES users(id) ON DELETE SET NULL,

  action      VARCHAR(100) NOT NULL,
  entity      VARCHAR(50)  NOT NULL,
  entity_id   UUID,

  old_values  JSONB,
  new_values  JSONB,
  metadata    JSONB,

  ip_address  INET,

  created_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_logs_shop   ON audit_logs(shop_id, created_at DESC);
CREATE INDEX idx_audit_logs_entity ON audit_logs(entity, entity_id);
CREATE INDEX idx_audit_logs_user   ON audit_logs(user_id, created_at DESC);


-- =========================================================
-- SUBSCRIPTION PLANS (future — uncomment when ready)
-- =========================================================
-- CREATE TABLE subscription_plans (
--   id          UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
--   name        VARCHAR(100)  NOT NULL,
--   price       DECIMAL(10,2) NOT NULL CHECK (price >= 0),
--   max_shops   INTEGER       NOT NULL CHECK (max_shops > 0),
--   max_users   INTEGER       NOT NULL CHECK (max_users > 0),
--   features    JSONB,
--   is_active   BOOLEAN       NOT NULL DEFAULT TRUE,
--   created_at  TIMESTAMPTZ   NOT NULL DEFAULT now()
-- );
--
-- CREATE TYPE subscription_status AS ENUM (
--   'TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELLED', 'EXPIRED'
-- );
--
-- CREATE TABLE user_subscriptions (
--   id          UUID                  PRIMARY KEY DEFAULT uuid_generate_v4(),
--   user_id     UUID                  NOT NULL REFERENCES users(id),
--   plan_id     UUID                  NOT NULL REFERENCES subscription_plans(id),
--   status      subscription_status   NOT NULL,
--   start_date  DATE                  NOT NULL,
--   end_date    DATE,
--   created_at  TIMESTAMPTZ           NOT NULL DEFAULT now()
-- );
--
-- CREATE TABLE subscription_payments (
--   id               UUID           PRIMARY KEY DEFAULT uuid_generate_v4(),
--   subscription_id  UUID           NOT NULL REFERENCES user_subscriptions(id) ON DELETE CASCADE,
--   amount           DECIMAL(10,2)  NOT NULL CHECK (amount >= 0),
--   method           payment_method NOT NULL,
--   paid_at          TIMESTAMPTZ    NOT NULL DEFAULT now()
-- );


-- =========================================================
-- DESIGN NOTES
-- =========================================================
--
-- TIMESTAMPS
--   All timestamps use TIMESTAMPTZ (timezone-aware).
--   Store and retrieve in UTC; convert in the app layer.
--
-- SOFT DELETE PATTERN
--   is_deleted = TRUE  → record is logically removed.
--   is_active  = FALSE → record is temporarily disabled.
--   Queries should always filter: WHERE is_deleted = FALSE.
--   Partial indexes on (…) WHERE is_deleted = FALSE keep
--   those queries fast without scanning deleted rows.
--
-- STOCK CONCURRENCY
--   stock_qty on product_items is the live counter.
--   Decrement it inside a transaction with:
--     SELECT id FROM product_items
--       WHERE id = $1 AND track_stock = TRUE
--       FOR UPDATE;
--   Then UPDATE product_items SET stock_qty = stock_qty - qty
--   and INSERT into inventory_movements in the same txn.
--   This prevents overselling under concurrent load.
--
-- ORDER TOTAL INTEGRITY
--   The CHECK constraint on orders ensures:
--     total_amount = subtotal + tax_amount - discount_amount
--   Compute these values in the app before INSERT/UPDATE.
--
-- AUDIT LOGS
--   Rows are append-only — never UPDATE or DELETE audit_logs.
--   old_values / new_values let you reconstruct the full
--   change history for any entity.
--
-- INDEXES
--   All (shop_id, created_at DESC) indexes support the
--   most common dashboard queries: "latest N orders for
--   shop X". The (shop_id, updated_at DESC) index on orders
--   supports real-time polling ("what changed since T?").
--
-- =========================================================