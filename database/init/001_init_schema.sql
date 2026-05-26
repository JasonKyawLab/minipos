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
CREATE TYPE shop_role        AS ENUM ('OWNER', 'MANAGER', 'CASHIER', 'CHEF', 'STAFF');

CREATE TYPE order_type       AS ENUM ('RETAIL', 'DINE_IN', 'TAKEAWAY', 'QR', 'DELIVERY', 'PICKUP', 'ONLINE');
CREATE TYPE order_status     AS ENUM ('OPEN', 'CONFIRMED', 'PAID', 'CANCELLED', 'REFUNDED');
CREATE TYPE order_item_status AS ENUM ('ACTIVE', 'CANCELLED', 'REFUNDED');

CREATE TYPE inventory_movement_type AS ENUM ('SALE', 'PURCHASE', 'ADJUSTMENT', 'REFUND');

CREATE TYPE payment_method   AS ENUM ('CASH', 'COD');
CREATE TYPE payment_status   AS ENUM ('PENDING', 'PAID', 'FAILED', 'REFUNDED', 'PARTIALLY_REFUNDED');

CREATE TYPE currency         AS ENUM ('USD', 'SGD', 'THB', 'MMK', 'EUR');

CREATE TYPE device_status    AS ENUM ('PENDING', 'APPROVED', 'REVOKED');
CREATE TYPE device_mode      AS ENUM ('POS', 'KITCHEN');

CREATE TYPE kitchen_status AS ENUM ('PENDING', 'PREPARING', 'READY', 'SERVED', 'CANCELLED');
CREATE TYPE kitchen_ticket_status AS ENUM ('QUEUED', 'IN_PROGRESS', 'READY', 'DONE', 'CANCELLED');
CREATE TYPE kitchen_priority AS ENUM ('NORMAL', 'HIGH');

CREATE TYPE terminal_mode AS ENUM ('POS', 'KITCHEN');

CREATE TYPE terminal_auth_method AS ENUM (
  'OWNER_PASSWORD',
  'MANAGER_PIN',
  'EMERGENCY_CODE'
);


-- =========================================================
-- updated_at TRIGGER FUNCTION
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
  id               UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  name             VARCHAR(100) NOT NULL,
  email            VARCHAR(150) NOT NULL,

  password_hash    TEXT         NOT NULL,

  role             user_role    NOT NULL,
  status           user_status  NOT NULL DEFAULT 'ACTIVE',

  token_version    INTEGER      NOT NULL DEFAULT 0,

  failed_attempts  SMALLINT     NOT NULL DEFAULT 0,
  locked_until     TIMESTAMPTZ,

  is_deleted       BOOLEAN      NOT NULL DEFAULT FALSE,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- Case-insensitive unique email across ALL users including soft-deleted.
-- Email is permanently reserved. A deleted account must be reactivated,
-- not re-registered.
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
--                    Stored as NUMERIC to avoid float drift.
-- timezone         — IANA timezone string used for
--                    order_no generation and reporting.
-- pin_max_attempts — how many wrong PINs before lockout.
-- =========================================================

CREATE TABLE shops (
  id          UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_id    UUID         NOT NULL REFERENCES users(id),

  name        VARCHAR(120) NOT NULL,
  shop_type   shop_type    NOT NULL,
  currency    currency     NOT NULL,

  tax_rate    NUMERIC(5,2) NOT NULL DEFAULT 0
              CHECK (tax_rate >= 0 AND tax_rate <= 100),
  timezone    VARCHAR(60)  NOT NULL DEFAULT 'UTC',

  pin_max_attempts SMALLINT     NOT NULL DEFAULT 5
                   CHECK (pin_max_attempts >= 1 AND pin_max_attempts <= 10),

  is_deleted  BOOLEAN      NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
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
--                    (UUID v4 or 32-byte hex). Used for device
--                    management (approve/revoke in dashboard).
--
-- terminal_token   — Hardware Passport. Issued once during
--                    the first mode activation on this device.
--                    Stored in an HttpOnly cookie on the tablet
--                    permanently. Survives staff logouts.
--                    Used ONLY to annotate work log entries —
--                    it has zero permissions on its own.
--                    Never rotated so the audit trail stays
--                    traceable across the device's lifetime.
--
-- approved_by      — user who approved / revoked the device.
-- last_seen_at     — updated on every authenticated request.
-- =========================================================

CREATE TABLE shop_devices (
  id            UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  shop_id       UUID          NOT NULL REFERENCES shops(id) ON DELETE CASCADE,

  device_name   VARCHAR(100),
  device_key    VARCHAR(100)  NOT NULL UNIQUE,

  -- Hardware passport: issued once, permanent, zero permissions.
  -- NULL until the device's first mode activation.
  terminal_token            VARCHAR(128) UNIQUE,
  terminal_token_issued_at  TIMESTAMPTZ,

  status        device_status NOT NULL DEFAULT 'PENDING',
  current_mode  device_mode   NULL,

  mode_activated_by  UUID     REFERENCES users(id) ON DELETE SET NULL,
  approved_by        UUID     REFERENCES users(id) ON DELETE SET NULL,
  mode_activated_at  TIMESTAMPTZ NULL,

  user_agent    TEXT,
  ip_address    INET,

  last_seen_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE INDEX idx_shop_devices_shop   ON shop_devices(shop_id);
CREATE INDEX idx_shop_devices_key    ON shop_devices(device_key);
CREATE INDEX idx_shop_devices_status ON shop_devices(shop_id, status);

-- Fast lookup on every PIN login: terminal_id cookie → device row.
-- Partial index excludes the NULL rows (devices not yet activated).
CREATE INDEX idx_shop_devices_terminal_token
  ON shop_devices(terminal_token)
  WHERE terminal_token IS NOT NULL;


-- =========================================================
-- STAFF MODE SESSIONS
-- =========================================================
-- Tracks each PIN login/logout within a device mode.
-- This is the work log the owner sees:
--   "who logged in, on which tablet, when, for how long"
--
-- device_id        — NULLABLE. Resolved from the terminal_id
--                    HttpOnly cookie during PIN login. If the
--                    cookie is absent (device never registered,
--                    or very first activation), the shift is
--                    still recorded without a device reference.
--                    Login must never fail because of a missing
--                    hardware passport.
--
-- logout_reason:
--   SELF      = staff pressed logout themselves
--   FORCE     = manager forced them out
--   MODE_EXIT = device mode was exited (ends all sessions)
-- =========================================================

CREATE TABLE staff_mode_sessions (
  id          UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  shop_id     UUID         NOT NULL REFERENCES shops(id) ON DELETE CASCADE,

  -- Nullable: resolved from terminal_id HttpOnly cookie at PIN login time.
  -- ON DELETE SET NULL so deleting a device record does not destroy
  -- the historical work log entries for that device.
  device_id   UUID         REFERENCES shop_devices(id) ON DELETE SET NULL,

  user_id     UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  mode_type   device_mode  NOT NULL,

  login_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
  logout_at   TIMESTAMPTZ,            -- NULL = currently active
  logout_reason VARCHAR(20),          -- SELF | FORCE | MODE_EXIT

  created_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX idx_staff_mode_sessions_device
  ON staff_mode_sessions(device_id, login_at DESC);

CREATE INDEX idx_staff_mode_sessions_user
  ON staff_mode_sessions(shop_id, user_id, login_at DESC);

-- Fast lookup: is this user currently active on this device?
CREATE INDEX idx_staff_mode_sessions_active
  ON staff_mode_sessions(device_id, logout_at)
  WHERE logout_at IS NULL;


-- =========================================================
-- SHOP USERS
-- =========================================================
-- Staff membership per shop. A user may hold a different
-- role in each shop they belong to.
--
-- pos_pin_hash     — for POS MODE login
-- kitchen_pin_hash — for KDS MODE login (separate from POS)
-- =========================================================

CREATE TABLE shop_users (
  id         UUID       PRIMARY KEY DEFAULT uuid_generate_v4(),
  shop_id    UUID       NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  user_id    UUID       NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  kitchen_pin_hash         TEXT,
  kitchen_pin_attempts     SMALLINT NOT NULL DEFAULT 0 CHECK (kitchen_pin_attempts >= 0),
  kitchen_pin_locked_until TIMESTAMPTZ,
  kitchen_token_version    INTEGER  NOT NULL DEFAULT 0,

  pos_pin_hash         VARCHAR(255),
  pos_pin_attempts     SMALLINT    NOT NULL DEFAULT 0 CHECK (pos_pin_attempts >= 0),
  pos_pin_locked_until TIMESTAMPTZ,
  pos_token_version    INTEGER     NOT NULL DEFAULT 0,

  role       shop_role  NOT NULL,
  is_active  BOOLEAN    NOT NULL DEFAULT TRUE,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (shop_id, user_id)
);

CREATE INDEX idx_shop_users_shop ON shop_users(shop_id);
CREATE INDEX idx_shop_users_user ON shop_users(user_id);


-- =========================================================
-- TERMINAL SESSIONS
-- =========================================================

CREATE TABLE terminal_sessions (
  id              UUID                 PRIMARY KEY DEFAULT uuid_generate_v4(),
  shop_id         UUID                 NOT NULL REFERENCES shops(id) ON DELETE CASCADE,

  -- Which physical device (tracked for audit, NOT trusted as auth).
  device_id       UUID                 REFERENCES shop_devices(id) ON DELETE SET NULL,

  -- The opaque token stored in the HttpOnly cookie.
  -- This is what the backend validates on every request.
  -- 32 random bytes → 64 hex chars. Never stored client-side.
  session_token   VARCHAR(128)         NOT NULL UNIQUE,

  mode            terminal_mode        NOT NULL,

  -- Who activated this terminal and how.
  authorized_by   UUID                 NOT NULL REFERENCES users(id),
  auth_method     terminal_auth_method NOT NULL DEFAULT 'OWNER_PASSWORD',

  -- Emergency code tracking (Level 2 delegation).
  emergency_code_id UUID,

  -- Heartbeat: updated by middleware on every authenticated request.
  last_seen_at    TIMESTAMPTZ          NOT NULL DEFAULT now(),

  -- Automatic expiry. NULL = no expiry (standard sessions).
  expires_at      TIMESTAMPTZ,

  -- Soft revocation: owner marks as revoked without deleting.
  is_revoked      BOOLEAN              NOT NULL DEFAULT FALSE,
  revoked_by      UUID                 REFERENCES users(id),
  revoked_at      TIMESTAMPTZ,

  created_at      TIMESTAMPTZ          NOT NULL DEFAULT now()
);

-- Fast lookup on every authenticated terminal request.
CREATE UNIQUE INDEX idx_terminal_sessions_token
  ON terminal_sessions(session_token)
  WHERE is_revoked = FALSE;

-- Owner dashboard: show all active terminals for shop X.
CREATE INDEX idx_terminal_sessions_shop_active
  ON terminal_sessions(shop_id, is_revoked, last_seen_at DESC)
  WHERE is_revoked = FALSE;

CREATE INDEX idx_terminal_sessions_device
  ON terminal_sessions(device_id)
  WHERE device_id IS NOT NULL;


-- =========================================================
-- EMERGENCY CODES
-- =========================================================
-- Single-use codes generated from the owner's dashboard.
-- A code can only be used ONCE and expires after 5 minutes.
-- After use, used_at is stamped and used_by is recorded.
-- The code can never be used again even before expiry.
-- =========================================================

CREATE TABLE emergency_codes (
  id          UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  shop_id     UUID          NOT NULL REFERENCES shops(id) ON DELETE CASCADE,

  -- The 8-character alphanumeric code shown to the owner.
  -- Stored as bcrypt hash, NEVER plaintext.
  code_hash   TEXT          NOT NULL,

  -- Which mode this code authorises.
  mode        terminal_mode NOT NULL,

  -- Who generated this code (must be OWNER).
  generated_by UUID         NOT NULL REFERENCES users(id),
  generated_at TIMESTAMPTZ  NOT NULL DEFAULT now(),

  -- Codes expire 5 minutes after generation.
  expires_at  TIMESTAMPTZ   NOT NULL DEFAULT (now() + INTERVAL '5 minutes'),

  -- Usage tracking (single-use enforcement).
  used_at     TIMESTAMPTZ,
  used_by     UUID          REFERENCES users(id),

  -- The terminal session created by this code.
  terminal_session_id UUID  REFERENCES terminal_sessions(id) ON DELETE SET NULL
);

-- Fast lookup during terminal activation.
CREATE UNIQUE INDEX idx_emergency_codes_unused
  ON emergency_codes(shop_id, mode)
  WHERE used_at IS NULL;

CREATE INDEX idx_emergency_codes_shop
  ON emergency_codes(shop_id, generated_at DESC);


-- =========================================================
-- RESTAURANT TABLES
-- =========================================================

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
-- track_stock  — FALSE for restaurants (food made to order).
-- stock_qty    — only meaningful when track_stock = TRUE.
--                Protected against negative values by CHECK
--                AND serialised UPDATE in application code
--                (SELECT ... FOR UPDATE).
-- is_sold_out  — manual override for temporary unavailability.
-- cost_price   — used for profit margin reporting.
-- is_deleted   — soft delete for lifecycle management.
-- =========================================================

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

-- Unique constraint excludes deleted items.
-- Allows barcode recycling after deletion.
CREATE UNIQUE INDEX idx_product_items_barcode
  ON product_items(barcode)
  WHERE barcode IS NOT NULL AND is_deleted = FALSE;

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

CREATE TABLE product_model_modifier_groups (
  product_model_id  UUID NOT NULL REFERENCES product_models(id) ON DELETE CASCADE,
  modifier_group_id UUID NOT NULL REFERENCES modifier_groups(id) ON DELETE CASCADE,

  PRIMARY KEY (product_model_id, modifier_group_id)
);


-- =========================================================
-- MODIFIER OPTIONS
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
--
-- quantity     — positive = stock in, negative = stock out.
--                CHECK (quantity <> 0) prevents no-ops.
-- reference_id — FK-like pointer to the causative entity.
--                Not a hard FK so historical rows survive
--                if the order is hard-deleted.
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

CREATE TABLE order_items (
  id                      UUID              PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id                UUID              NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_item_id         UUID              REFERENCES product_items(id) ON DELETE SET NULL,

  kitchen_status          kitchen_status    NOT NULL DEFAULT 'PENDING',

  product_name_snapshot   VARCHAR(255)      NOT NULL,
  item_name_snapshot      VARCHAR(255)      NOT NULL,
  unit_price_snapshot     DECIMAL(12,2)     NOT NULL CHECK (unit_price_snapshot >= 0),

  qty                     INTEGER           NOT NULL CHECK (qty > 0),
  subtotal                DECIMAL(12,2)     NOT NULL CHECK (subtotal >= 0),

  modifier_snapshot       JSONB             NOT NULL DEFAULT '[]',

  item_note               VARCHAR(255),

  status                  order_item_status NOT NULL DEFAULT 'ACTIVE',

  refunded_qty            INTEGER           NOT NULL DEFAULT 0 CHECK (refunded_qty >= 0),

  created_at              TIMESTAMPTZ       NOT NULL DEFAULT now(),

  CONSTRAINT chk_refunded_qty_lte_qty CHECK (refunded_qty <= qty)
);

CREATE INDEX idx_order_items_order          ON order_items(order_id);
CREATE INDEX idx_order_items_product_item   ON order_items(product_item_id)
  WHERE product_item_id IS NOT NULL;
CREATE INDEX idx_order_items_kitchen_status ON order_items(order_id, kitchen_status);
CREATE INDEX idx_order_items_kitchen_active ON order_items(kitchen_status)
  WHERE kitchen_status IN ('PENDING', 'PREPARING');


-- =========================================================
-- KITCHEN STATIONS
-- =========================================================

CREATE TABLE kitchen_stations (
  id          UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  shop_id     UUID         NOT NULL REFERENCES shops(id) ON DELETE CASCADE,

  name        VARCHAR(100) NOT NULL,
  description TEXT,
  color       VARCHAR(7),  -- hex colour e.g. #FF5733

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


-- =========================================================
-- KITCHEN TICKETS
-- =========================================================

CREATE TABLE kitchen_tickets (
  id              UUID                  PRIMARY KEY DEFAULT uuid_generate_v4(),
  shop_id         UUID                  NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  order_id        UUID                  NOT NULL REFERENCES orders(id) ON DELETE CASCADE,

  -- Denormalised snapshot fields for fast display queries.
  order_no        VARCHAR(30)           NOT NULL,
  order_type      order_type            NOT NULL,
  table_number    VARCHAR(20),
  customer_name   VARCHAR(150),
  notes           TEXT,

  ticket_status   kitchen_ticket_status NOT NULL DEFAULT 'QUEUED',
  priority        kitchen_priority      NOT NULL DEFAULT 'NORMAL',

  station_id      UUID                  REFERENCES kitchen_stations(id) ON DELETE SET NULL,

  -- Performance timestamps for kitchen analytics.
  queued_at       TIMESTAMPTZ           NOT NULL DEFAULT now(),
  first_bump_at   TIMESTAMPTZ,
  all_ready_at    TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,

  created_at      TIMESTAMPTZ           NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ           NOT NULL DEFAULT now(),

  UNIQUE (shop_id, order_id)
);

CREATE INDEX idx_kitchen_tickets_shop_status
  ON kitchen_tickets(shop_id, ticket_status);

-- Primary index for the live kitchen display query.
CREATE INDEX idx_kitchen_tickets_active
  ON kitchen_tickets(shop_id, ticket_status, priority DESC, queued_at ASC)
  WHERE ticket_status IN ('QUEUED', 'IN_PROGRESS', 'READY');

CREATE INDEX idx_kitchen_tickets_order ON kitchen_tickets(order_id);

CREATE TRIGGER trg_kitchen_tickets_updated_at
  BEFORE UPDATE ON kitchen_tickets
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- =========================================================
-- KITCHEN STATION CATEGORIES
-- =========================================================

CREATE TABLE kitchen_station_categories (
  station_id        UUID NOT NULL REFERENCES kitchen_stations(id) ON DELETE CASCADE,
  product_model_id  UUID NOT NULL REFERENCES product_models(id) ON DELETE CASCADE,

  PRIMARY KEY (station_id, product_model_id)
);

CREATE INDEX idx_kitchen_station_categories_model
  ON kitchen_station_categories(product_model_id);


-- =========================================================
-- PAYMENTS
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

CREATE INDEX idx_refunds_order        ON refunds(order_id);
CREATE INDEX idx_refunds_payment      ON refunds(payment_id) WHERE payment_id IS NOT NULL;
CREATE INDEX idx_refunds_order_amount ON refunds(order_id, amount);
CREATE INDEX idx_refunds_order_created ON refunds(order_id, created_at DESC);
CREATE INDEX idx_refunds_idempotency  ON refunds(idempotency_key)
  WHERE idempotency_key IS NOT NULL;


-- =========================================================
-- AUDIT LOGS
-- =========================================================
-- Immutable event log. Rows are never updated or deleted.
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
-- FOREIGN KEY: EMERGENCY CODES ↔ TERMINAL SESSIONS
-- =========================================================
-- Added after both tables exist to avoid circular dependency.
-- =========================================================

ALTER TABLE terminal_sessions
  ADD CONSTRAINT fk_terminal_sessions_emergency_code
  FOREIGN KEY (emergency_code_id)
  REFERENCES emergency_codes(id)
  ON DELETE SET NULL;


-- =========================================================
-- DESIGN NOTES
-- =========================================================
--
-- HARDWARE PASSPORT (terminal_token)
--   shop_devices.terminal_token is a permanent identity for
--   a physical tablet. It is issued once during the first mode
--   activation and stored in an HttpOnly cookie on the device.
--   It survives staff logouts. It has zero permissions on its
--   own — it is only read during PIN login to annotate the
--   staff_mode_sessions row with a real device_id. This is
--   what makes the Work Log traceable to physical hardware.
--
-- WORK LOG TRACEABILITY
--   staff_mode_sessions.device_id is NULLABLE. It is resolved
--   from the terminal_id HttpOnly cookie at PIN login time.
--   If the cookie is absent, the shift is still recorded —
--   just without a device reference. Login must never fail
--   because of a missing hardware passport.
--
-- NIL UUID BUG
--   If you see "Key (user_id)=(00000000-...) is not present",
--   your backend is passing an empty/null UUID. Check your
--   service layer: ensure userId is valid before calling the
--   repository.
--
-- TIMESTAMPS
--   All timestamps use TIMESTAMPTZ (timezone-aware).
--   Store and retrieve in UTC; convert in the app layer.
--
-- SOFT DELETE PATTERN
--   is_deleted = TRUE  → record is logically removed.
--   is_active  = FALSE → record is temporarily disabled.
--   Queries should always filter: WHERE is_deleted = FALSE.
--
-- STOCK CONCURRENCY
--   Decrement stock inside a transaction with:
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
--
-- INDEXES
--   All (shop_id, created_at DESC) indexes support the most
--   common dashboard queries: "latest N orders for shop X".
--
-- =========================================================