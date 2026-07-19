-- Plan system: free / pro tiers with configurable limits

CREATE TYPE user_plan AS ENUM ('free', 'pro');

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS plan user_plan NOT NULL DEFAULT 'free';

-- One row per plan — edit limits here without code changes
CREATE TABLE IF NOT EXISTS plan_limits (
  plan             user_plan    PRIMARY KEY,
  max_shops        INT          NOT NULL,
  max_products     INT          NOT NULL,  -- per shop (product models)
  max_staff        INT          NOT NULL,  -- per shop
  max_tables       INT          NOT NULL,  -- per shop
  order_history_days INT        NOT NULL,  -- -1 = unlimited
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- Beta limits: generous so testers aren't blocked
INSERT INTO plan_limits (plan, max_shops, max_products, max_staff, max_tables, order_history_days)
VALUES
  ('free', 3,   200, 10, 20, -1),
  ('pro',  20, 1000, 50, 100, -1)
ON CONFLICT (plan) DO NOTHING;
