-- =========================
-- EXTENSIONS
-- =========================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- =========================
-- ENUM DEFINITIONS
-- =========================
CREATE TYPE user_role AS ENUM ('ADMIN', 'USER');
CREATE TYPE user_status AS ENUM ('ACTIVE', 'SUSPENDED');

CREATE TYPE shop_type AS ENUM ('RETAIL', 'RESTAURANT');
CREATE TYPE shop_role AS ENUM ('OWNER', 'MANAGER', 'CASHIER');

CREATE TYPE order_type AS ENUM ('RETAIL', 'DINE_IN', 'TAKEAWAY', 'QR');
CREATE TYPE order_status AS ENUM (
  'OPEN',
  'CONFIRMED',
  'PAID',
  'CANCELLED',
  'REFUNDED'
);

CREATE TYPE order_item_status AS ENUM (
  'ACTIVE',
  'CANCELLED',
  'REFUNDED'
);

CREATE TYPE inventory_movement_type AS ENUM ('SALE','PURCHASE','ADJUSTMENT','REFUND');
CREATE TYPE payment_method AS ENUM ('CASH', 'CARD', 'QR', 'BANK');
CREATE TYPE payment_status AS ENUM ('PAID', 'REFUNDED');
CREATE TYPE currency AS ENUM ('USD', 'SGD', 'THB', 'MMK', 'EUR');

-- =========================
-- USERS
-- =========================
-- Note: For simplicity, we are storing password hashes directly. 
-- In production, consider using a separate authentication service or 
-- at least salting and hashing passwords securely.
-- =========================
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(100) NOT NULL,
  email VARCHAR(150) NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role user_role NOT NULL,
  status user_status NOT NULL DEFAULT 'ACTIVE',
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_users_email_lower
ON users (LOWER(email));

-- =========================
-- SHOPS
-- =========================
-- Note: Each shop can have multiple users with different roles (owner, manager, cashier).
-- The owner is the one who created the shop and has full permissions.
-- Managers can manage products and orders but cannot delete the shop.
-- Cashiers can only create orders and process payments.
-- =========================

CREATE TABLE shops (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_id UUID NOT NULL REFERENCES users(id),
  name VARCHAR(120) NOT NULL,
  shop_type shop_type NOT NULL,
  currency currency NOT NULL,
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now()
);

-- =========================
-- SHOP USERS
-- =========================
-- Note: This table manages the many-to-many relationship between shops and users, 
-- along with their specific roles within each shop. 
-- A user can have different roles in different shops (e.g., owner in one shop, cashier in another).
-- The UNIQUE constraint on (shop_id, user_id) ensures that a user cannot have multiple roles in the same shop.
-- =========================
CREATE TABLE shop_users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role shop_role NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE (shop_id, user_id)
);

CREATE INDEX idx_shop_users_shop_id ON shop_users(shop_id);
CREATE INDEX idx_shop_users_user_id ON shop_users(user_id);

-- =========================
-- RESTAURANT TABLES
-- =========================
-- Note: This table is only relevant for shops of type 'RESTAURANT'.
-- Each table has a unique QR token that can be used for customers to scan and place orders directly from their phones.
-- The UNIQUE constraint on (shop_id, table_number) ensures that each table number is unique within a shop,
-- while the UNIQUE constraint on qr_token ensures that each QR token is unique across all tables.
-- =========================
CREATE TABLE restaurant_tables (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  table_number VARCHAR(20) NOT NULL,
  qr_token VARCHAR(100) NOT NULL UNIQUE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT now(),
  UNIQUE (shop_id, table_number)
);

-- =========================
-- PRODUCTS
-- =========================
-- Note: Each product belongs to a shop and has a unique barcode within that shop for easy scanning at checkout.
-- The price field is required and must be non-negative, while the cost_price is optional but must also be non-negative if provided.
-- The stock_qty field tracks the current inventory level of the product and cannot be negative.
-- The is_active flag allows for temporarily disabling a product without deleting it,
-- while the is_deleted flag allows for soft deletion of products, preserving data integrity and audit trails.
-- =========================
CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  name VARCHAR(150) NOT NULL,
  description TEXT,
  image_url TEXT,
  barcode VARCHAR(50),
  price DECIMAL(10,2) NOT NULL CHECK (price >= 0),
  cost_price DECIMAL(10,2) CHECK (cost_price >= 0),
  stock_qty INTEGER NOT NULL DEFAULT 0 CHECK (stock_qty >= 0),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now()
);

-- Prevent duplicate barcode inside same shop
CREATE UNIQUE INDEX unique_barcode_per_shop
ON products(shop_id, barcode)
WHERE barcode IS NOT NULL;

-- Fast POS scanning
CREATE INDEX idx_products_shop_barcode
ON products(shop_id, barcode);

CREATE INDEX idx_products_shop_id ON products(shop_id);

-- =========================
-- INVENTORY MOVEMENTS 
-- =========================
-- Purpose: This table tracks all inventory changes for products,
-- including sales, purchases, adjustments, and refunds.
-- Each movement is associated with a shop and a product, and includes the type of movement, quantity changed,
-- and an optional reference ID for linking to related entities (e.g., order ID for sales).
-- This allows for detailed inventory tracking and auditing over time.
-- =========================
CREATE TABLE inventory_movements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id),
  type inventory_movement_type NOT NULL,
  quantity INTEGER NOT NULL,
  reference_id UUID,
  created_at TIMESTAMP DEFAULT now()
);

CREATE INDEX idx_inventory_product_id
ON inventory_movements(product_id);

-- =========================
-- ORDERS
-- =========================
-- Purpose: This table captures all orders placed in the system,
-- whether they are retail sales, dine-in orders, takeaways, or
-- QR code orders. Each order is associated with a shop and optionally a cashier (user).
-- The order includes details such as order number, type, associated table (for dine-in),
-- financial amounts (subtotal, tax, discount, total), and status.
-- The UNIQUE constraint on (shop_id, order_no) ensures that each order number is unique within a shop for easy reference and tracking.
-- =========================
CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  shop_id UUID NOT NULL REFERENCES shops(id),
  cashier_id UUID REFERENCES users(id),

  order_no VARCHAR(30) NOT NULL,
  order_type order_type NOT NULL,

  table_id UUID REFERENCES restaurant_tables(id),

  subtotal DECIMAL(12,2) NOT NULL DEFAULT 0,
  tax_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  discount_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  total_amount DECIMAL(12,2) NOT NULL DEFAULT 0,

  status order_status NOT NULL DEFAULT 'OPEN',

  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now(),

  UNIQUE (shop_id, order_no),

  CONSTRAINT dinein_requires_table CHECK (
    (order_type = 'DINE_IN' AND table_id IS NOT NULL)
    OR
    (order_type <> 'DINE_IN')
  )
);

CREATE INDEX idx_orders_shop_id ON orders(shop_id);
CREATE INDEX idx_orders_cashier_id ON orders(cashier_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_shop_status
ON orders(shop_id, status);

-- =========================
-- ORDER ITEMS
-- =========================
-- Purpose: This table captures the individual items within each order,
-- including references to the product being sold, as well as snapshots of the product name and unit price at the time of the order.
-- This allows for accurate historical records even if product details change later.
-- Each order item is associated with an order and has its own status to track cancellations or refunds at the item level.
-- =========================
CREATE TABLE order_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id),

  product_name_snapshot VARCHAR(255) NOT NULL,
  unit_price_snapshot DECIMAL(12,2) NOT NULL,

  qty INTEGER NOT NULL CHECK (qty > 0),
  subtotal DECIMAL(12,2) NOT NULL CHECK (subtotal >= 0),

  status order_item_status NOT NULL DEFAULT 'ACTIVE',

  created_at TIMESTAMP DEFAULT now()
);

CREATE INDEX idx_order_items_order_id ON order_items(order_id);

-- =========================
-- PAYMENTS
-- =========================
-- Purpose: This table records all payments made for orders,
-- including the payment method, amount, status, and any transaction reference or notes.
-- Each payment is linked to an order, and the status field allows for tracking whether a payment has been made or refunded.
-- This structure supports multiple payments per order if needed (e.g., split payments) and provides a clear audit trail for financial transactions.
-- =========================
CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,

  method payment_method NOT NULL,
  amount DECIMAL(12,2) NOT NULL CHECK (amount >= 0),

  status payment_status NOT NULL DEFAULT 'PAID',

  transaction_ref VARCHAR(100),
  note TEXT,

  paid_at TIMESTAMP DEFAULT now(),
  created_at TIMESTAMP DEFAULT now()
);

CREATE INDEX idx_payments_order_id ON payments(order_id);

-- =========================
-- REFUNDS
-- =========================
-- Purpose: This table captures refund transactions for orders, linking back to the original order and payment (if applicable).
-- It records the refund amount, reason for the refund, and the timestamp of when the refund was created.
-- This allows for tracking refunds separately from payments while maintaining a clear connection to
-- the original transaction for auditing and reporting purposes.
-- =========================
CREATE TABLE refunds (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID NOT NULL REFERENCES orders(id),
  payment_id UUID REFERENCES payments(id),

  amount DECIMAL(12,2) NOT NULL,
  reason TEXT,
  created_at TIMESTAMP DEFAULT now()
);

-- =========================
-- AUDIT LOGS
-- =========================
-- Purpose: This table serves as an audit log to track significant actions performed within the system,
-- such as creating or updating shops, products, orders, and payments.
-- Each log entry includes references to the shop and user responsible for the action (if applicable), a description of the action taken,
-- the entity affected, and any relevant metadata in JSONB format. This allows for comprehensive auditing and monitoring of system activity over time.
-- =========================
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  shop_id UUID REFERENCES shops(id) ON DELETE SET NULL,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(100) NOT NULL,
  entity VARCHAR(50) NOT NULL,
  entity_id UUID,
  metadata JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_logs_shop_id ON audit_logs(shop_id);
CREATE INDEX idx_audit_logs_entity ON audit_logs(entity, entity_id);
-- -- =========================
-- -- SUBSCRIPTION PLANS (FUTURE)
-- -- =========================
-- CREATE TABLE subscription_plans (
--   id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
--   name VARCHAR(100) NOT NULL,
--   price DECIMAL(10,2) NOT NULL,
--   max_shops INTEGER NOT NULL,
--   max_users INTEGER NOT NULL,
--   features JSONB,
--   is_active BOOLEAN NOT NULL DEFAULT true,
--   created_at TIMESTAMP NOT NULL DEFAULT now()
-- );

-- -- =========================
-- -- USER SUBSCRIPTIONS
-- -- =========================
-- CREATE TABLE user_subscriptions (
--   id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
--   user_id UUID NOT NULL REFERENCES users(id),
--   plan_id UUID NOT NULL REFERENCES subscription_plans(id),
--   status subscription_status NOT NULL,
--   start_date DATE NOT NULL,
--   end_date DATE,
--   created_at TIMESTAMP NOT NULL DEFAULT now()
-- );

-- -- =========================
-- -- SUBSCRIPTION PAYMENTS
-- -- =========================
-- CREATE TABLE subscription_payments (
--   id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
--   subscription_id UUID NOT NULL REFERENCES user_subscriptions(id) ON DELETE CASCADE,
--   amount DECIMAL(10,2) NOT NULL,
--   method payment_method NOT NULL,
--   paid_at TIMESTAMP NOT NULL DEFAULT now()
-- );


-- -- =========================
-- -- Description
-- -- =========================
-- -- isdeleted : soft delete flag. When true, the record is considered deleted and should be ignored in queries. This allows for data recovery and audit trails without permanently removing records from the database.
-- -- isactive : indicates whether the record is currently active or not. This can be used to temporarily disable a record without deleting it, allowing for easy reactivation in the future.
