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
CREATE TYPE order_status AS ENUM ('PENDING', 'PAID', 'CANCELLED', 'REFUNDED');
CREATE TYPE payment_method AS ENUM ('CASH', 'CARD', 'QR', 'BANK');
CREATE TYPE payment_status AS ENUM ('PAID', 'REFUNDED');
CREATE TYPE currency AS ENUM ('USD', 'SGD', 'THB', 'MMK', 'EUR');

--REATE TYPE subscription_status AS ENUM ('ACTIVE', 'CANCELLED', 'EXPIRED');

-- =========================
-- USERS
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

-- =========================
-- SHOPS
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
-- SHOP USERS (MANY-TO-MANY)
-- =========================
CREATE TABLE shop_users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  role shop_role NOT NULL,
  UNIQUE (shop_id, user_id)
);

-- =========================
-- PRODUCTS (Retail + Restaurant)
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
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now()
);

-- =========================
-- ORDERS
-- =========================
CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE RESTRICT,
  cashier_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  order_no VARCHAR(30) NOT NULL,
  total_amount DECIMAL(12,2) NOT NULL CHECK (total_amount >= 0),
  status order_status NOT NULL DEFAULT 'PENDING',
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now(),
  UNIQUE (shop_id, order_no)
);

-- =========================
-- ORDER ITEMS
-- =========================
CREATE TABLE order_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id),
  qty INTEGER NOT NULL CHECK (qty > 0),
  price DECIMAL(10,2) NOT NULL CHECK (price >= 0),
  subtotal DECIMAL(12,2) NOT NULL CHECK (subtotal >= 0)
);

-- =========================
-- PAYMENTS
-- =========================
CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  method payment_method NOT NULL,
  amount DECIMAL(12,2) NOT NULL CHECK (amount >= 0),
  status payment_status NOT NULL DEFAULT 'PAID',
  note TEXT,
  paid_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now()
);

-- =========================
-- AUDIT LOGS
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

-- =========================
-- INDEXES 
-- =========================
CREATE INDEX idx_shop_users_shop_id ON shop_users(shop_id);
CREATE INDEX idx_shop_users_user_id ON shop_users(user_id);
CREATE UNIQUE INDEX idx_users_email_lower
ON users (LOWER(email));

CREATE INDEX idx_products_shop_id ON products(shop_id);
CREATE INDEX idx_products_barcode ON products(barcode);

CREATE INDEX idx_orders_shop_id ON orders(shop_id);
CREATE INDEX idx_orders_cashier_id ON orders(cashier_id);
CREATE INDEX idx_orders_status ON orders(status);

CREATE INDEX idx_order_items_order_id ON order_items(order_id);

CREATE INDEX idx_payments_order_id ON payments(order_id);

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