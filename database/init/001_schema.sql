-- =============================================================
-- MiniPOS · Database Schema
-- =============================================================
-- Multi-tenant POS platform. Every shop shares one database,
-- isolated by shop_id on every table.
--
-- Supported shop types:
--   RETAIL       — standard counter / barcode sales
--   RESTAURANT   — dine-in, takeaway, QR table ordering
--   ONLINE_SHOP  — delivery / pickup orders
-- =============================================================


-- =============================================================
-- EXTENSIONS
-- =============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pgcrypto;


-- =============================================================
-- ENUMS
-- =============================================================

-- Platform-level user role (ADMIN = platform staff, USER = shop owner/staff)
CREATE TYPE user_role        AS ENUM ('ADMIN', 'USER');
CREATE TYPE user_status      AS ENUM ('ACTIVE', 'SUSPENDED');

-- Shop classification and staff roles within a shop
CREATE TYPE shop_type        AS ENUM ('RETAIL', 'RESTAURANT', 'ONLINE_SHOP');
CREATE TYPE shop_role        AS ENUM ('OWNER', 'MANAGER', 'CASHIER', 'CHEF', 'STAFF');

-- Order lifecycle and line-item lifecycle
CREATE TYPE order_type       AS ENUM ('RETAIL', 'DINE_IN', 'TAKEAWAY', 'QR', 'DELIVERY', 'PICKUP', 'ONLINE');
CREATE TYPE order_status     AS ENUM ('OPEN', 'CONFIRMED', 'CLOSING', 'PAID', 'CANCELLED', 'REFUNDED');
CREATE TYPE order_item_status AS ENUM ('ACTIVE', 'CANCELLED', 'REFUNDED');

-- Stock ledger movement types
CREATE TYPE inventory_movement_type AS ENUM ('SALE', 'PURCHASE', 'ADJUSTMENT', 'REFUND');

-- Payment methods and payment states
CREATE TYPE payment_method   AS ENUM ('CASH', 'COD');
CREATE TYPE payment_status   AS ENUM ('PENDING', 'PAID', 'FAILED', 'REFUNDED', 'PARTIALLY_REFUNDED');

-- Supported shop currencies
CREATE TYPE currency         AS ENUM ('USD', 'SGD', 'THB', 'MMK', 'EUR');

-- Physical device registration states
CREATE TYPE device_status    AS ENUM ('PENDING', 'APPROVED', 'REVOKED');
CREATE TYPE device_mode      AS ENUM ('POS', 'KITCHEN');

-- Kitchen display item and ticket states
CREATE TYPE kitchen_status        AS ENUM ('PENDING', 'PREPARING', 'READY', 'SERVED', 'CANCELLED');
CREATE TYPE kitchen_ticket_status AS ENUM ('QUEUED', 'IN_PROGRESS', 'READY', 'DONE', 'CANCELLED');
CREATE TYPE kitchen_priority      AS ENUM ('NORMAL', 'HIGH');

-- Terminal session mode and how the session was authorised
CREATE TYPE terminal_mode        AS ENUM ('POS', 'KITCHEN');
CREATE TYPE terminal_auth_method AS ENUM ('OWNER_PASSWORD', 'MANAGER_PIN', 'EMERGENCY_CODE');


-- =============================================================
-- SHARED TRIGGER: updated_at
-- =============================================================
-- Attached to every table that has an updated_at column.
-- Automatically stamps the current time on every UPDATE.

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


-- =============================================================
-- USERS
-- =============================================================
-- Platform-level accounts. One user can own or work at
-- multiple shops simultaneously.
--
-- token_version   — increment to invalidate all active JWTs
--                   for this user without a token blacklist.
-- failed_attempts — brute-force counter, reset on success.
-- locked_until    — NULL = not locked. Set after N failures.
-- is_deleted      — soft delete; the email stays reserved
--                   so the account can be reactivated later.

CREATE TABLE users (
  id              UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  name            VARCHAR(100) NOT NULL,
  email           VARCHAR(150) NOT NULL,

  password_hash   TEXT         NOT NULL,

  role            user_role    NOT NULL,
  status          user_status  NOT NULL DEFAULT 'ACTIVE',

  token_version   INTEGER      NOT NULL DEFAULT 0,

  failed_attempts SMALLINT     NOT NULL DEFAULT 0,
  locked_until    TIMESTAMPTZ,

  is_deleted      BOOLEAN      NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- Case-insensitive unique email. Deleted accounts still
-- hold their email — they must be reactivated, not re-registered.
CREATE UNIQUE INDEX idx_users_email ON users (LOWER(email));

CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- =============================================================
-- SHOPS
-- =============================================================
-- Each shop is an independent business on the platform.
-- owner_id always has a matching shop_users row with role=OWNER.
--
-- tax_rate         — shop-wide tax percentage (0–100).
--                    NUMERIC avoids floating-point drift.
-- timezone         — IANA string used for order_no generation
--                    and all time-zone-aware reports.
-- pin_max_attempts — wrong PIN attempts before staff lockout.
-- is_suspended     — platform admin can lock a shop without
--                    deleting it. Owner sees why they are
--                    locked out; all operational access is blocked.

CREATE TABLE shops (
  id          UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_id    UUID         NOT NULL REFERENCES users(id),

  name        VARCHAR(120) NOT NULL,
  shop_type   shop_type    NOT NULL,
  currency    currency     NOT NULL,

  tax_rate    NUMERIC(5,2) NOT NULL DEFAULT 0
              CHECK (tax_rate >= 0 AND tax_rate <= 100),
  timezone    VARCHAR(60)  NOT NULL DEFAULT 'UTC',

  pin_max_attempts SMALLINT NOT NULL DEFAULT 5
                   CHECK (pin_max_attempts >= 1 AND pin_max_attempts <= 10),

  is_suspended     BOOLEAN      NOT NULL DEFAULT FALSE,
  suspended_reason VARCHAR(255),
  suspended_at     TIMESTAMPTZ,

  is_deleted  BOOLEAN      NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX idx_shops_owner     ON shops(owner_id);
CREATE INDEX idx_shops_suspended ON shops(id) WHERE is_suspended = TRUE;

CREATE TRIGGER trg_shops_updated_at
  BEFORE UPDATE ON shops
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- =============================================================
-- SHOP USERS (Staff Membership)
-- =============================================================
-- Joins a platform user to a shop with a specific role.
-- A user can have a different role in each shop they belong to.
--
-- pos_pin_hash / kitchen_pin_hash
--   — bcrypt hashes of the 4–6 digit PINs used to log into
--     POS mode and Kitchen mode respectively.
-- pos_token_version / kitchen_token_version
--   — increment to force-logout a staff member from that mode
--     without affecting their platform account.
-- pos_pin_locked_until / kitchen_pin_locked_until
--   — NULL = not locked. Set after pin_max_attempts failures.

CREATE TABLE shop_users (
  id         UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  shop_id    UUID        NOT NULL REFERENCES shops(id)  ON DELETE CASCADE,
  user_id    UUID        NOT NULL REFERENCES users(id)  ON DELETE CASCADE,

  role       shop_role   NOT NULL,
  is_active  BOOLEAN     NOT NULL DEFAULT TRUE,

  pos_pin_hash             VARCHAR(255),
  pos_pin_attempts         SMALLINT    NOT NULL DEFAULT 0 CHECK (pos_pin_attempts >= 0),
  pos_pin_locked_until     TIMESTAMPTZ,
  pos_token_version        INTEGER     NOT NULL DEFAULT 0,

  kitchen_pin_hash         TEXT,
  kitchen_pin_attempts     SMALLINT    NOT NULL DEFAULT 0 CHECK (kitchen_pin_attempts >= 0),
  kitchen_pin_locked_until TIMESTAMPTZ,
  kitchen_token_version    INTEGER     NOT NULL DEFAULT 0,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (shop_id, user_id)
);

CREATE INDEX idx_shop_users_shop ON shop_users(shop_id);
CREATE INDEX idx_shop_users_user ON shop_users(user_id);


-- =============================================================
-- SHOP DEVICES
-- =============================================================
-- Tracks every physical device (tablet, POS terminal) that
-- has attempted to access a shop. New devices start as PENDING
-- and must be APPROVED by an OWNER or MANAGER.
--
-- device_key      — random token generated on first app install.
--                   Used for device management in the dashboard.
-- terminal_token  — "Hardware Passport". Issued once on the
--                   device's first mode activation. Stored in
--                   an HttpOnly cookie permanently on the tablet.
--                   Survives staff logouts. Has zero permissions
--                   on its own — only used to link work-log
--                   entries to a physical device. Never rotated
--                   so the audit trail stays traceable.
-- last_seen_at    — updated on every authenticated request.

CREATE TABLE shop_devices (
  id           UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  shop_id      UUID          NOT NULL REFERENCES shops(id) ON DELETE CASCADE,

  device_name  VARCHAR(100),
  device_key   VARCHAR(100)  NOT NULL UNIQUE,

  terminal_token           VARCHAR(128) UNIQUE,
  terminal_token_issued_at TIMESTAMPTZ,

  status       device_status NOT NULL DEFAULT 'PENDING',
  current_mode device_mode   NULL,

  approved_by        UUID    REFERENCES users(id) ON DELETE SET NULL,
  mode_activated_by  UUID    REFERENCES users(id) ON DELETE SET NULL,
  mode_activated_at  TIMESTAMPTZ,

  user_agent   TEXT,
  ip_address   INET,

  last_seen_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE INDEX idx_shop_devices_shop   ON shop_devices(shop_id);
CREATE INDEX idx_shop_devices_key    ON shop_devices(device_key);
CREATE INDEX idx_shop_devices_status ON shop_devices(shop_id, status);

-- Fast lookup: terminal_id cookie → device row on every PIN login.
-- Partial index excludes NULLs (devices not yet activated).
CREATE INDEX idx_shop_devices_terminal_token
  ON shop_devices(terminal_token)
  WHERE terminal_token IS NOT NULL;


-- =============================================================
-- TERMINAL SESSIONS
-- =============================================================
-- An active POS or Kitchen session on a physical device.
-- Created when an owner or manager activates a device mode.
-- Validated on every terminal API request via the HttpOnly cookie.
--
-- session_token   — 32 random bytes (64 hex chars). Stored in
--                   an HttpOnly cookie. Never visible to JS.
-- authorized_by   — the platform user who activated this session.
-- emergency_code_id — set when activated via a single-use
--                   emergency code instead of the owner's password.
-- last_seen_at    — heartbeat updated by middleware on each request.
-- expires_at      — NULL = no expiry (standard sessions).
-- is_revoked      — owner can revoke a session without deleting it,
--                   preserving the audit trail.

CREATE TABLE terminal_sessions (
  id                UUID                 PRIMARY KEY DEFAULT uuid_generate_v4(),
  shop_id           UUID                 NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  device_id         UUID                 REFERENCES shop_devices(id) ON DELETE SET NULL,

  session_token     VARCHAR(128)         NOT NULL UNIQUE,
  mode              terminal_mode        NOT NULL,

  authorized_by     UUID                 NOT NULL REFERENCES users(id),
  auth_method       terminal_auth_method NOT NULL DEFAULT 'OWNER_PASSWORD',
  emergency_code_id UUID,

  last_seen_at      TIMESTAMPTZ          NOT NULL DEFAULT now(),
  expires_at        TIMESTAMPTZ,

  is_revoked        BOOLEAN              NOT NULL DEFAULT FALSE,
  revoked_by        UUID                 REFERENCES users(id),
  revoked_at        TIMESTAMPTZ,

  created_at        TIMESTAMPTZ          NOT NULL DEFAULT now()
);

-- Primary lookup on every terminal request.
CREATE UNIQUE INDEX idx_terminal_sessions_token
  ON terminal_sessions(session_token)
  WHERE is_revoked = FALSE;

-- Owner dashboard: all active terminals for a shop.
CREATE INDEX idx_terminal_sessions_shop_active
  ON terminal_sessions(shop_id, is_revoked, last_seen_at DESC)
  WHERE is_revoked = FALSE;

CREATE INDEX idx_terminal_sessions_device
  ON terminal_sessions(device_id)
  WHERE device_id IS NOT NULL;


-- =============================================================
-- EMERGENCY CODES
-- =============================================================
-- Single-use codes generated by the owner from the dashboard.
-- Allow a manager to activate a terminal without the owner's
-- password. A code expires 5 minutes after generation and
-- can only be used once.

CREATE TABLE emergency_codes (
  id           UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  shop_id      UUID          NOT NULL REFERENCES shops(id) ON DELETE CASCADE,

  -- 8-character alphanumeric code shown to the owner.
  -- Stored as a bcrypt hash, never plaintext.
  code_hash    TEXT          NOT NULL,

  mode         terminal_mode NOT NULL,

  generated_by UUID          NOT NULL REFERENCES users(id),
  generated_at TIMESTAMPTZ   NOT NULL DEFAULT now(),
  expires_at   TIMESTAMPTZ   NOT NULL DEFAULT (now() + INTERVAL '5 minutes'),

  used_at      TIMESTAMPTZ,
  used_by      UUID          REFERENCES users(id),

  terminal_session_id UUID   REFERENCES terminal_sessions(id) ON DELETE SET NULL
);

-- Only one unused code per shop+mode at a time.
CREATE UNIQUE INDEX idx_emergency_codes_unused
  ON emergency_codes(shop_id, mode)
  WHERE used_at IS NULL;

CREATE INDEX idx_emergency_codes_shop
  ON emergency_codes(shop_id, generated_at DESC);


-- =============================================================
-- STAFF MODE SESSIONS (Work Log)
-- =============================================================
-- Records every PIN login and logout within a device mode.
-- This is the work log the owner sees in the dashboard:
-- "who logged in, on which tablet, when, and for how long."
--
-- device_id       — NULLABLE. Resolved from the terminal_id
--                   HttpOnly cookie at PIN login time. If the
--                   cookie is absent the shift is still recorded
--                   without a device reference. Login must never
--                   fail because of a missing hardware passport.
-- logout_reason   — SELF (staff pressed logout) | FORCE (manager)
--                   | MODE_EXIT (device mode was exited)

CREATE TABLE staff_mode_sessions (
  id            UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  shop_id       UUID        NOT NULL REFERENCES shops(id)       ON DELETE CASCADE,
  device_id     UUID        REFERENCES shop_devices(id)         ON DELETE SET NULL,
  user_id       UUID        NOT NULL REFERENCES users(id)       ON DELETE CASCADE,

  mode_type     device_mode NOT NULL,

  login_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  logout_at     TIMESTAMPTZ,
  logout_reason VARCHAR(20),

  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_staff_mode_sessions_device
  ON staff_mode_sessions(device_id, login_at DESC);

CREATE INDEX idx_staff_mode_sessions_user
  ON staff_mode_sessions(shop_id, user_id, login_at DESC);

-- Fast check: is this user currently active on this device?
CREATE INDEX idx_staff_mode_sessions_active
  ON staff_mode_sessions(device_id, logout_at)
  WHERE logout_at IS NULL;


-- =============================================================
-- RESTAURANT TABLES
-- =============================================================
-- Physical dining tables in a restaurant. Each table has a
-- unique QR token that links to the QR ordering flow.
--
-- qr_token    — rotated by the owner to invalidate old QR codes
--               (e.g. if a code is photographed by a non-guest).
-- table_number — unique within the shop (e.g. "T1", "Bar 3").

CREATE TABLE restaurant_tables (
  id           UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  shop_id      UUID        NOT NULL REFERENCES shops(id) ON DELETE CASCADE,

  table_number VARCHAR(20) NOT NULL,
  capacity     SMALLINT    CHECK (capacity > 0),

  qr_token     VARCHAR(100) NOT NULL UNIQUE,
  is_active    BOOLEAN      NOT NULL DEFAULT TRUE,

  created_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),

  UNIQUE (shop_id, table_number)
);

CREATE INDEX idx_restaurant_tables_shop ON restaurant_tables(shop_id);


-- =============================================================
-- PRODUCT CATEGORIES
-- =============================================================
-- Optional grouping for product models within a shop.
-- Used in the POS sidebar to filter the product list.
-- Deleting a category sets category_id = NULL on its products
-- (they become "Uncategorised") rather than deleting them.

CREATE TABLE product_categories (
  id         UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  shop_id    UUID         NOT NULL REFERENCES shops(id) ON DELETE CASCADE,

  name       VARCHAR(100) NOT NULL,
  color      VARCHAR(7),               -- hex colour, e.g. "#0D7A5F"
  image_url  TEXT,

  sort_order SMALLINT     NOT NULL DEFAULT 0,
  is_deleted BOOLEAN      NOT NULL DEFAULT FALSE,

  created_at TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX idx_product_categories_shop
  ON product_categories(shop_id)
  WHERE is_deleted = FALSE;

CREATE TRIGGER trg_product_categories_updated_at
  BEFORE UPDATE ON product_categories
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- =============================================================
-- PRODUCT MODELS
-- =============================================================
-- The canonical identity of a product (brand, name, image).
-- One model can have multiple sellable items (sizes, colours).
--
-- Example:
--   Model  → "Coca-Cola"
--   Items  → "Coca-Cola 330ml", "Coca-Cola 1L"
--
-- category_id — nullable. NULL = Uncategorised.
--               ON DELETE SET NULL so deleting a category does
--               not delete its products.

CREATE TABLE product_models (
  id          UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  shop_id     UUID         NOT NULL REFERENCES shops(id)        ON DELETE CASCADE,
  category_id UUID         REFERENCES product_categories(id)    ON DELETE SET NULL,

  name        VARCHAR(150) NOT NULL,
  description TEXT,
  image_url   TEXT,

  is_active   BOOLEAN      NOT NULL DEFAULT TRUE,
  is_deleted  BOOLEAN      NOT NULL DEFAULT FALSE,

  created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX idx_product_models_shop        ON product_models(shop_id);
CREATE INDEX idx_product_models_category    ON product_models(category_id) WHERE is_deleted = FALSE;
CREATE INDEX idx_product_models_shop_active ON product_models(shop_id, is_active) WHERE is_deleted = FALSE;

CREATE TRIGGER trg_product_models_updated_at
  BEFORE UPDATE ON product_models
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- =============================================================
-- PRODUCT ITEMS (SKUs)
-- =============================================================
-- The actual sellable unit — a specific size, colour, or
-- variant of a product model. Every order line references
-- an item, not a model.
--
-- track_stock  — FALSE for restaurants (food is made to order).
-- stock_qty    — protected against negatives by CHECK constraint
--                and SELECT FOR UPDATE in the order service.
-- is_sold_out  — manual override for temporary unavailability.
-- cost_price   — used for profit margin reporting.

CREATE TABLE product_items (
  id               UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_model_id UUID          NOT NULL REFERENCES product_models(id) ON DELETE CASCADE,

  name             VARCHAR(100)  NOT NULL,
  sku              VARCHAR(100),
  barcode          VARCHAR(50),

  price            DECIMAL(10,2) NOT NULL CHECK (price >= 0),
  cost_price       DECIMAL(10,2)           CHECK (cost_price >= 0),

  track_stock      BOOLEAN       NOT NULL DEFAULT TRUE,
  stock_qty        INTEGER       NOT NULL DEFAULT 0 CHECK (stock_qty >= 0),

  is_active        BOOLEAN       NOT NULL DEFAULT TRUE,
  is_sold_out      BOOLEAN       NOT NULL DEFAULT FALSE,
  is_deleted       BOOLEAN       NOT NULL DEFAULT FALSE,

  created_at       TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ   NOT NULL DEFAULT now()
);

-- Partial unique: allows barcode reuse after a soft delete.
CREATE UNIQUE INDEX idx_product_items_barcode
  ON product_items(barcode)
  WHERE barcode IS NOT NULL AND is_deleted = FALSE;

CREATE INDEX idx_product_items_model  ON product_items(product_model_id);
CREATE INDEX idx_product_items_active ON product_items(product_model_id, is_active);

CREATE TRIGGER trg_product_items_updated_at
  BEFORE UPDATE ON product_items
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- =============================================================
-- MODIFIER GROUPS
-- =============================================================
-- A named set of customisation options attached to a product model.
-- Examples: "Spice Level", "Add-ons", "Cooking Preference".
--
-- is_required  — if TRUE, the cashier must pick at least one option.
-- min_select   — minimum options the customer must choose.
-- max_select   — maximum options allowed (1 = radio, >1 = checkbox).

CREATE TABLE modifier_groups (
  id          UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  shop_id     UUID         NOT NULL REFERENCES shops(id) ON DELETE CASCADE,

  name        VARCHAR(100) NOT NULL,

  is_required BOOLEAN      NOT NULL DEFAULT FALSE,
  min_select  SMALLINT     NOT NULL DEFAULT 0 CHECK (min_select >= 0),
  max_select  SMALLINT     NOT NULL DEFAULT 1 CHECK (max_select >= min_select),

  sort_order  SMALLINT     NOT NULL DEFAULT 0,
  is_deleted  BOOLEAN      NOT NULL DEFAULT FALSE,

  created_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX idx_modifier_groups_shop ON modifier_groups(shop_id);


-- =============================================================
-- PRODUCT ↔ MODIFIER GROUP (Join Table)
-- =============================================================
-- Links a product model to the modifier groups that apply to it.
-- A modifier group can be shared across multiple products.

CREATE TABLE product_model_modifier_groups (
  product_model_id  UUID NOT NULL REFERENCES product_models(id)  ON DELETE CASCADE,
  modifier_group_id UUID NOT NULL REFERENCES modifier_groups(id)  ON DELETE CASCADE,

  PRIMARY KEY (product_model_id, modifier_group_id)
);


-- =============================================================
-- MODIFIER OPTIONS
-- =============================================================
-- The individual choices within a modifier group.
-- Example: "Extra Spicy (+$0.50)", "No Ice (+$0.00)".
--
-- price_delta            — added to the item price when selected.
--                          Negative values are allowed (discounts).
-- linked_product_item_id — optional link to a product item for
--                          stock deduction when this option is chosen.

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


-- =============================================================
-- INVENTORY MOVEMENTS
-- =============================================================
-- Append-only ledger of every stock change.
-- Never update or delete rows — only INSERT.
--
-- quantity     — positive = stock in, negative = stock out.
--                Zero is rejected by the CHECK constraint.
-- reference_id — soft pointer to the causative entity (order_id,
--                purchase_id, etc.). Not a hard FK so historical
--                rows survive if the source record is deleted.

CREATE TABLE inventory_movements (
  id              UUID                    PRIMARY KEY DEFAULT uuid_generate_v4(),
  shop_id         UUID                    NOT NULL REFERENCES shops(id)          ON DELETE CASCADE,
  product_item_id UUID                    NOT NULL REFERENCES product_items(id)  ON DELETE CASCADE,

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


-- =============================================================
-- ORDERS
-- =============================================================
-- The central transaction record. One order per customer visit
-- or cart checkout.
--
-- order_no         — human-readable ID shown on receipts.
--                    Unique per shop (not globally).
-- cashier_id       — the staff member who created the order.
--                    ON DELETE SET NULL preserves history.
-- table_id         — required for DINE_IN, NULL for all others.
--                    Enforced by the dinein_requires_table CHECK.
-- bill_requested   — TRUE when the customer at a QR table taps
--                    "Request Bill". Cashier sees a badge on the
--                    table map and can open the order to close it.
-- subtotal         — sum of line items before tax/discount.
-- tax_amount       — calculated from shop tax_rate.
-- discount_amount  — manual or coupon discount applied.
-- total_amount     — must equal subtotal + tax - discount.
--                    Enforced by a CHECK constraint.

CREATE TABLE orders (
  id               UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  shop_id          UUID          NOT NULL REFERENCES shops(id)             ON DELETE CASCADE,
  cashier_id       UUID          REFERENCES users(id)                       ON DELETE SET NULL,

  order_no         VARCHAR(30)   NOT NULL,
  order_type       order_type    NOT NULL,
  status           order_status  NOT NULL DEFAULT 'OPEN',

  table_id         UUID          REFERENCES restaurant_tables(id)           ON DELETE SET NULL,

  subtotal         DECIMAL(12,2) NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
  tax_amount       DECIMAL(12,2) NOT NULL DEFAULT 0 CHECK (tax_amount >= 0),
  discount_amount  DECIMAL(12,2) NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
  total_amount     DECIMAL(12,2) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),

  bill_requested   BOOLEAN       NOT NULL DEFAULT FALSE,
  bill_requested_at TIMESTAMPTZ,

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
    order_type <> 'DINE_IN' OR table_id IS NOT NULL
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

-- Cashier POS: quickly find all tables that have requested the bill.
CREATE INDEX idx_orders_bill_requested
  ON orders(shop_id, bill_requested)
  WHERE bill_requested = TRUE;

CREATE TRIGGER trg_orders_updated_at
  BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- =============================================================
-- ORDER ITEMS (Line Items)
-- =============================================================
-- One row per product item added to an order.
--
-- product_item_id      — nullable. Set to NULL if the product
--                        is deleted after the order was placed.
-- *_snapshot fields    — copy of name and price at time of sale.
--                        Ensures receipts are accurate even if
--                        the product is later edited or deleted.
-- modifier_snapshot    — JSON array of selected modifier options
--                        at the time of the order.
-- ticket_id            — links to the kitchen ticket this item
--                        belongs to (supports multi-round ordering).
-- refunded_qty         — how many units have been refunded.
--                        Always <= qty (enforced by CHECK).

CREATE TABLE order_items (
  id                    UUID              PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id              UUID              NOT NULL REFERENCES orders(id)        ON DELETE CASCADE,
  product_item_id       UUID              REFERENCES product_items(id)          ON DELETE SET NULL,
  ticket_id             UUID              REFERENCES kitchen_tickets(id)        ON DELETE SET NULL,

  kitchen_status        kitchen_status    NOT NULL DEFAULT 'PENDING',
  status                order_item_status NOT NULL DEFAULT 'ACTIVE',

  product_name_snapshot VARCHAR(255)      NOT NULL,
  item_name_snapshot    VARCHAR(255)      NOT NULL,
  unit_price_snapshot   DECIMAL(12,2)     NOT NULL CHECK (unit_price_snapshot >= 0),

  qty                   INTEGER           NOT NULL CHECK (qty > 0),
  subtotal              DECIMAL(12,2)     NOT NULL CHECK (subtotal >= 0),

  modifier_snapshot     JSONB             NOT NULL DEFAULT '[]',
  item_note             VARCHAR(255),

  refunded_qty          INTEGER           NOT NULL DEFAULT 0 CHECK (refunded_qty >= 0),

  created_at            TIMESTAMPTZ       NOT NULL DEFAULT now(),

  CONSTRAINT chk_refunded_qty_lte_qty CHECK (refunded_qty <= qty)
);

CREATE INDEX idx_order_items_order          ON order_items(order_id);
CREATE INDEX idx_order_items_product_item   ON order_items(product_item_id)  WHERE product_item_id IS NOT NULL;
CREATE INDEX idx_order_items_ticket         ON order_items(ticket_id)        WHERE ticket_id IS NOT NULL;
CREATE INDEX idx_order_items_kitchen_status ON order_items(order_id, kitchen_status);
CREATE INDEX idx_order_items_kitchen_active ON order_items(kitchen_status)   WHERE kitchen_status IN ('PENDING', 'PREPARING');


-- =============================================================
-- KITCHEN STATIONS
-- =============================================================
-- Logical workstations within a kitchen (e.g. "Grill", "Drinks").
-- Each station can be assigned specific product models.
-- The KDS (kitchen display) can be filtered by station.

CREATE TABLE kitchen_stations (
  id          UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  shop_id     UUID         NOT NULL REFERENCES shops(id) ON DELETE CASCADE,

  name        VARCHAR(100) NOT NULL,
  description TEXT,
  color       VARCHAR(7),   -- hex colour, e.g. "#FF5733"

  is_active   BOOLEAN      NOT NULL DEFAULT TRUE,
  sort_order  SMALLINT     NOT NULL DEFAULT 0,

  created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),

  UNIQUE (shop_id, name)
);

CREATE INDEX idx_kitchen_stations_shop ON kitchen_stations(shop_id);

CREATE TRIGGER trg_kitchen_stations_updated_at
  BEFORE UPDATE ON kitchen_stations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- =============================================================
-- KITCHEN TICKETS
-- =============================================================
-- One ticket represents one round of food preparation for an order.
-- Restaurants with multi-round ordering (add-ons mid-meal) produce
-- multiple tickets per order.
--
-- round      — 1 = first order, 2 = second round (add-on), etc.
-- is_addon   — TRUE when round > 1. Triggers the ADD-ON badge on
--              the KDS so the chef knows it is a mid-meal addition.
-- priority   — HIGH tickets appear at the top of the KDS.
-- queued_at  — when the ticket entered the kitchen queue.
-- first_bump_at / all_ready_at / completed_at
--            — timestamps for kitchen performance analytics.

CREATE TABLE kitchen_tickets (
  id            UUID                  PRIMARY KEY DEFAULT uuid_generate_v4(),
  shop_id       UUID                  NOT NULL REFERENCES shops(id)    ON DELETE CASCADE,
  order_id      UUID                  NOT NULL REFERENCES orders(id)   ON DELETE CASCADE,

  order_no      VARCHAR(30)           NOT NULL,
  order_type    order_type            NOT NULL,
  table_number  VARCHAR(20),
  customer_name VARCHAR(150),
  notes         TEXT,

  ticket_status kitchen_ticket_status NOT NULL DEFAULT 'QUEUED',
  priority      kitchen_priority      NOT NULL DEFAULT 'NORMAL',
  station_id    UUID                  REFERENCES kitchen_stations(id)  ON DELETE SET NULL,

  round         INT                   NOT NULL DEFAULT 1,
  is_addon      BOOLEAN               NOT NULL DEFAULT FALSE,

  queued_at     TIMESTAMPTZ           NOT NULL DEFAULT now(),
  first_bump_at TIMESTAMPTZ,
  all_ready_at  TIMESTAMPTZ,
  completed_at  TIMESTAMPTZ,

  created_at    TIMESTAMPTZ           NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ           NOT NULL DEFAULT now()
);

CREATE INDEX idx_kitchen_tickets_shop_status ON kitchen_tickets(shop_id, ticket_status);
CREATE INDEX idx_kitchen_tickets_order       ON kitchen_tickets(order_id);
CREATE INDEX idx_kitchen_tickets_order_round ON kitchen_tickets(order_id, round);

-- Primary index for the live KDS display query.
CREATE INDEX idx_kitchen_tickets_active
  ON kitchen_tickets(shop_id, ticket_status, priority DESC, queued_at ASC)
  WHERE ticket_status IN ('QUEUED', 'IN_PROGRESS', 'READY');

CREATE TRIGGER trg_kitchen_tickets_updated_at
  BEFORE UPDATE ON kitchen_tickets
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- =============================================================
-- KITCHEN STATION ↔ PRODUCT MODEL (Join Table)
-- =============================================================
-- Assigns product models to a kitchen station.
-- When an order item belongs to a model assigned to a station,
-- the ticket is routed to that station's KDS.

CREATE TABLE kitchen_station_categories (
  station_id       UUID NOT NULL REFERENCES kitchen_stations(id)  ON DELETE CASCADE,
  product_model_id UUID NOT NULL REFERENCES product_models(id)    ON DELETE CASCADE,

  PRIMARY KEY (station_id, product_model_id)
);

CREATE INDEX idx_kitchen_station_categories_model
  ON kitchen_station_categories(product_model_id);


-- =============================================================
-- PAYMENTS
-- =============================================================
-- Records how an order was paid. An order can have at most one
-- payment in the current implementation.
--
-- received_amount — how much cash the customer handed over.
-- change_amount   — received_amount minus the order total.
--                   Both are only meaningful for CASH payments.
-- transaction_ref — reference number for non-cash payments.

CREATE TABLE payments (
  id              UUID           PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id        UUID           NOT NULL REFERENCES orders(id) ON DELETE CASCADE,

  method          payment_method NOT NULL,
  amount          DECIMAL(12,2)  NOT NULL CHECK (amount >= 0),
  received_amount DECIMAL(12,2)           CHECK (received_amount >= 0),
  change_amount   DECIMAL(12,2)           CHECK (change_amount >= 0),

  status          payment_status NOT NULL DEFAULT 'PENDING',

  transaction_ref VARCHAR(100),
  note            TEXT,

  paid_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ    NOT NULL DEFAULT now(),

  CONSTRAINT cash_received_required CHECK (
    method <> 'CASH' OR received_amount IS NOT NULL
  )
);

CREATE INDEX idx_payments_order  ON payments(order_id);
CREATE INDEX idx_payments_status ON payments(status);


-- =============================================================
-- REFUNDS
-- =============================================================
-- Records a full or partial refund against an order.
-- Multiple refunds can exist per order (partial refunds).
--
-- idempotency_key — prevents duplicate refunds if the client
--                   retries the same request. Generated by the
--                   app layer (UUID or hash of order+amount).

CREATE TABLE refunds (
  id              UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id        UUID          NOT NULL REFERENCES orders(id),
  payment_id      UUID          REFERENCES payments(id) ON DELETE SET NULL,

  amount          DECIMAL(12,2) NOT NULL CHECK (amount > 0),
  reason          TEXT,

  idempotency_key VARCHAR(100)  UNIQUE,
  processed_by    UUID          REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE INDEX idx_refunds_order       ON refunds(order_id);
CREATE INDEX idx_refunds_payment     ON refunds(payment_id)       WHERE payment_id IS NOT NULL;
CREATE INDEX idx_refunds_idempotency ON refunds(idempotency_key)  WHERE idempotency_key IS NOT NULL;


-- =============================================================
-- AUDIT LOGS
-- =============================================================
-- Immutable event log for security and compliance.
-- Rows are NEVER updated or deleted — only inserted.
--
-- action     — what happened, e.g. "SHOP_SUSPENDED", "REFUND_ISSUED".
-- entity     — which resource type, e.g. "shop", "order", "user".
-- entity_id  — the UUID of the affected resource.
-- old/new_values — JSON snapshot of changed fields.

CREATE TABLE audit_logs (
  id         UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  shop_id    UUID         REFERENCES shops(id) ON DELETE SET NULL,
  user_id    UUID         REFERENCES users(id) ON DELETE SET NULL,

  action     VARCHAR(100) NOT NULL,
  entity     VARCHAR(50)  NOT NULL,
  entity_id  UUID,

  old_values JSONB,
  new_values JSONB,
  metadata   JSONB,

  ip_address INET,

  created_at TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_logs_shop   ON audit_logs(shop_id,  created_at DESC);
CREATE INDEX idx_audit_logs_entity ON audit_logs(entity, entity_id);
CREATE INDEX idx_audit_logs_user   ON audit_logs(user_id,  created_at DESC);


-- =============================================================
-- DEFERRED FOREIGN KEY: terminal_sessions ↔ emergency_codes
-- =============================================================
-- These two tables reference each other, so neither FK can be
-- declared inside the CREATE TABLE — one table must exist first.
-- This ALTER TABLE is placed here, after both are created.

ALTER TABLE terminal_sessions
  ADD CONSTRAINT fk_terminal_sessions_emergency_code
  FOREIGN KEY (emergency_code_id)
  REFERENCES emergency_codes(id)
  ON DELETE SET NULL;
