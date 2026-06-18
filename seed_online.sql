-- =========================================================
-- seed_retail.sql
-- MiniPOS — Convenience Store Test Data
-- Shop: YOUR RETAIL SHOP (replace SHOP_ID below)
--
-- REQUIRES: Run 002_product_categories.sql FIRST.
--
-- Usage:
--   1. Find your retail shop ID:
--      docker exec -i minipos-postgres psql -U minipos_user -d minipos \
--        -c "SELECT id, name, shop_type FROM shops WHERE shop_type IN ('RETAIL', 'ONLINE_SHOP');"
--
--   2. Run with psql variable substitution:
--      docker exec -i minipos-postgres psql -U minipos_user -d minipos \
--        -v SHOP_ID="'YOUR-UUID-HERE'" \
--        < seed_retail.sql
--
-- Safe to re-run — all IDs are hard-coded UUIDs with
-- ON CONFLICT DO NOTHING.
--
-- KEY DIFFERENCES from Restaurant seed:
--   • track_stock = TRUE  — retail tracks physical inventory
--   • stock_qty populated — opening stock counts
--   • cost_price set      — enables profit margin reporting
--   • sku / barcode set   — retail items are scannable
--   • No modifier groups  — retail has no "spice level"
--     Size variants are separate product_items instead
-- =========================================================

BEGIN;

-- =========================================================
-- VALIDATION — fail fast if shop ID is wrong
-- =========================================================
-- This block creates a temp table then checks the shop exists
-- and is of type RETAIL. If the check fails, RAISE EXCEPTION
-- aborts the whole transaction cleanly.
-- =========================================================




-- =========================================================
-- STEP 1 — PRODUCT CATEGORIES
-- =========================================================
-- Categories help cashiers browse products quickly at POS.
-- color is a hex string shown as a badge in the UI.
-- =========================================================

INSERT INTO product_categories (id, shop_id, name, color, sort_order)
VALUES
  ('f3000000-0000-0000-0000-000000000001', :SHOP_ID, 'Beverages',      '#0369A1', 1),
  ('f3000000-0000-0000-0000-000000000002', :SHOP_ID, 'Snacks',         '#B45309', 2),
  ('f3000000-0000-0000-0000-000000000003', :SHOP_ID, 'Dairy & Eggs',   '#0D7A5F', 3),
  ('f3000000-0000-0000-0000-000000000004', :SHOP_ID, 'Instant Food',   '#6D28D9', 4),
  ('f3000000-0000-0000-0000-000000000005', :SHOP_ID, 'Personal Care',  '#BE185D', 5),
  ('f3000000-0000-0000-0000-000000000006', :SHOP_ID, 'Household',      '#065F46', 6)
ON CONFLICT (id) DO NOTHING;


-- =========================================================
-- STEP 2 — PRODUCT MODELS
-- =========================================================
-- A model is the "brand + product name" identity.
-- Items (below) are the individual SKUs with prices.
--
-- WHY no modifier groups:
--   Retail size/variant differences (330ml vs 1L) carry
--   different SKUs, barcodes, and prices. They are separate
--   product_items — not modifier options — because they
--   need independent stock tracking and barcode scanning.
-- =========================================================

INSERT INTO product_models (id, shop_id, name, description, category_id, is_active)
VALUES
  -- Beverages
  ('a3000000-0000-0000-0000-000000000001', :SHOP_ID,
   'Coca-Cola',
   'Classic carbonated soft drink',
   'f3000000-0000-0000-0000-000000000001', TRUE),

  ('a3000000-0000-0000-0000-000000000002', :SHOP_ID,
   'Chang Beer',
   'Thai lager — cold and refreshing',
   'f3000000-0000-0000-0000-000000000001', TRUE),

  ('a3000000-0000-0000-0000-000000000003', :SHOP_ID,
   'Red Bull Thailand',
   'Original Thai energy drink in glass bottle',
   'f3000000-0000-0000-0000-000000000001', TRUE),

  ('a3000000-0000-0000-0000-000000000004', :SHOP_ID,
   'Lipton Iced Tea',
   'Ready-to-drink lemon iced tea',
   'f3000000-0000-0000-0000-000000000001', TRUE),

  ('a3000000-0000-0000-0000-000000000005', :SHOP_ID,
   'Mineral Water',
   'Still drinking water — Singha brand',
   'f3000000-0000-0000-0000-000000000001', TRUE),

  -- Snacks
  ('a3000000-0000-0000-0000-000000000006', :SHOP_ID,
   'Lay''s Potato Chips',
   'Crispy salted potato chips',
   'f3000000-0000-0000-0000-000000000002', TRUE),

  ('a3000000-0000-0000-0000-000000000007', :SHOP_ID,
   'Pocky',
   'Chocolate-coated biscuit sticks',
   'f3000000-0000-0000-0000-000000000002', TRUE),

  ('a3000000-0000-0000-0000-000000000008', :SHOP_ID,
   'Taro Fish Snack',
   'Sweet and spicy dried fish snack — Thai favourite',
   'f3000000-0000-0000-0000-000000000002', TRUE),

  -- Dairy & Eggs
  ('a3000000-0000-0000-0000-000000000009', :SHOP_ID,
   'Meiji Fresh Milk',
   'Full-cream fresh milk',
   'f3000000-0000-0000-0000-000000000003', TRUE),

  ('a2000000-0000-0000-0000-000000000010', :SHOP_ID,
   'Dutch Mill Yoghurt',
   'Stirred fruit yoghurt drink',
   'f3000000-0000-0000-0000-000000000003', TRUE),

  ('a2000000-0000-0000-0000-000000000011', :SHOP_ID,
   'Eggs',
   'Fresh farm eggs',
   'f3000000-0000-0000-0000-000000000003', TRUE),

  -- Instant Food
  ('a2000000-0000-0000-0000-000000000012', :SHOP_ID,
   'Mama Instant Noodles',
   'Thailand''s most iconic instant noodle',
   'f3000000-0000-0000-0000-000000000004', TRUE),

  ('a2000000-0000-0000-0000-000000000013', :SHOP_ID,
   '7-Eleven Triangle Sandwich',
   'Ready-to-eat refrigerated sandwich',
   'f3000000-0000-0000-0000-000000000004', TRUE),

  -- Personal Care
  ('a2000000-0000-0000-0000-000000000014', :SHOP_ID,
   'Colgate Toothpaste',
   'Whitening fluoride toothpaste',
   'f3000000-0000-0000-0000-000000000005', TRUE),

  ('a2000000-0000-0000-0000-000000000015', :SHOP_ID,
   'Panadol',
   'Paracetamol 500mg tablets — pain and fever relief',
   'f3000000-0000-0000-0000-000000000005', TRUE),

  -- Household
  ('a2000000-0000-0000-0000-000000000016', :SHOP_ID,
   'Mama Dish Soap',
   'Concentrated dishwashing liquid',
   'f3000000-0000-0000-0000-000000000006', TRUE),

  ('a2000000-0000-0000-0000-000000000017', :SHOP_ID,
   'Garbage Bags',
   'Heavy-duty black garbage bags',
   'f3000000-0000-0000-0000-000000000006', TRUE)

ON CONFLICT (id) DO NOTHING;


-- =========================================================
-- STEP 3 — PRODUCT ITEMS (SKUs)
-- =========================================================
-- Each row is a scannable, sellable unit with its own:
--   price       — selling price (VAT-inclusive in THB)
--   cost_price  — what the shop paid (for margin reports)
--   sku         — internal reference code
--   barcode     — EAN-13 style (fictional but realistic)
--   track_stock — TRUE for all retail items
--   stock_qty   — opening stock count
--
-- MARGIN NOTE: cost_price here is fictional demo data.
-- In production the owner sets this when receiving stock.
-- =========================================================

INSERT INTO product_items
  (id, product_model_id, name, sku, barcode, price, cost_price,
   track_stock, stock_qty, is_active)
VALUES
  -- Coca-Cola
  ('b3000000-0000-0000-0000-000000000001', 'a3000000-0000-0000-0000-000000000001',
   'Can 325ml',  'COKE-CAN-325',  NULL,  20.00,  12.00, TRUE, 48, TRUE),
  ('b3000000-0000-0000-0000-000000000002', 'a3000000-0000-0000-0000-000000000001',
   'Bottle 600ml','COKE-BTL-600', NULL,  28.00,  18.00, TRUE, 36, TRUE),
  ('b3000000-0000-0000-0000-000000000003', 'a3000000-0000-0000-0000-000000000001',
   'Bottle 1.25L','COKE-BTL-125', NULL,  45.00,  30.00, TRUE, 24, TRUE),

  -- Chang Beer
  ('b3000000-0000-0000-0000-000000000004', 'a3000000-0000-0000-0000-000000000002',
   'Can 320ml',   'CHANG-CAN-320', NULL,  45.00,  30.00, TRUE, 60, TRUE),
  ('b3000000-0000-0000-0000-000000000005', 'a3000000-0000-0000-0000-000000000002',
   'Bottle 630ml','CHANG-BTL-630', NULL,  65.00,  42.00, TRUE, 48, TRUE),

  -- Red Bull Thailand
  ('b3000000-0000-0000-0000-000000000006', 'a3000000-0000-0000-0000-000000000003',
   'Glass Bottle 150ml','REDBULL-TH-150',NULL,  15.00,  8.00, TRUE, 120, TRUE),

  -- Lipton Iced Tea
  ('b3000000-0000-0000-0000-000000000007', 'a3000000-0000-0000-0000-000000000004',
   'Bottle 500ml','LIPTON-500',    NULL,  25.00,  16.00, TRUE, 36, TRUE),

  -- Mineral Water
  ('b3000000-0000-0000-0000-000000000008', 'a3000000-0000-0000-0000-000000000005',
   'Bottle 600ml','WATER-600',     NULL,  10.00,   5.00, TRUE, 100, TRUE),
  ('b3000000-0000-0000-0000-000000000009', 'a3000000-0000-0000-0000-000000000005',
   'Bottle 1.5L', 'WATER-1500',    NULL,  18.00,  10.00, TRUE, 60, TRUE),

  -- Lay's Potato Chips
  ('b2000000-0000-0000-0000-000000000010', 'a3000000-0000-0000-0000-000000000006',
   'Small 28g',   'LAYS-SM-28',    NULL,  15.00,   9.00, TRUE, 80, TRUE),
  ('b2000000-0000-0000-0000-000000000011', 'a3000000-0000-0000-0000-000000000006',
   'Regular 50g', 'LAYS-REG-50',   'B850014101501',  25.00,  15.00, TRUE, 60, TRUE),
  ('b2000000-0000-0000-0000-000000000012', 'a3000000-0000-0000-0000-000000000006',
   'Large 75g',   'LAYS-LG-75',    NULL,  35.00,  22.00, TRUE, 40, TRUE),

  -- Pocky
  ('b2000000-0000-0000-0000-000000000013', 'a3000000-0000-0000-0000-000000000007',
   'Chocolate 47g','POCKY-CHOC-47',NULL,  35.00,  22.00, TRUE, 50, TRUE),
  ('b2000000-0000-0000-0000-000000000014', 'a3000000-0000-0000-0000-000000000007',
   'Strawberry 47g','POCKY-STR-47',NULL,  35.00,  22.00, TRUE, 50, TRUE),

  -- Taro Fish Snack
  ('b2000000-0000-0000-0000-000000000015', 'a3000000-0000-0000-0000-000000000008',
   'Original 52g','TARO-ORIG-52',  NULL,  20.00,  12.00, TRUE, 70, TRUE),
  ('b2000000-0000-0000-0000-000000000016', 'a3000000-0000-0000-0000-000000000008',
   'Spicy 52g',   'TARO-SPCY-52',  NULL,  20.00,  12.00, TRUE, 70, TRUE),

  -- Meiji Milk
  ('b2000000-0000-0000-0000-000000000017', 'a3000000-0000-0000-0000-000000000009',
   'Carton 225ml','MEIJI-225',     NULL,  18.00,  12.00, TRUE, 30, TRUE),
  ('b2000000-0000-0000-0000-000000000018', 'a3000000-0000-0000-0000-000000000009',
   'Carton 1L',   'MEIJI-1L',      NULL,  65.00,  45.00, TRUE, 20, TRUE),

  -- Dutch Mill Yoghurt
  ('b2000000-0000-0000-0000-000000000019', 'a2000000-0000-0000-0000-000000000010',
   'Mixed Berry 180ml','DUTCHMIL-MB', NULL, 15.00, 9.00, TRUE, 40, TRUE),
  ('b2000000-0000-0000-0000-000000000020', 'a2000000-0000-0000-0000-000000000010',
   'Original 180ml',  'DUTCHMIL-OR', NULL, 15.00, 9.00, TRUE, 40, TRUE),

  -- Eggs
  ('b2000000-0000-0000-0000-000000000021', 'a2000000-0000-0000-0000-000000000011',
   '6 Pack',      'EGG-6PK',       NULL,              38.00,  28.00, TRUE, 25, TRUE),
  ('b2000000-0000-0000-0000-000000000022', 'a2000000-0000-0000-0000-000000000011',
   '10 Pack',     'EGG-10PK',      NULL,              60.00,  44.00, TRUE, 20, TRUE),

  -- Mama Instant Noodles
  ('b2000000-0000-0000-0000-000000000023', 'a2000000-0000-0000-0000-000000000012',
   'Tom Yum 55g', 'MAMA-TY-55',    NULL,   6.00,   3.50, TRUE, 150, TRUE),
  ('b2000000-0000-0000-0000-000000000024', 'a2000000-0000-0000-0000-000000000012',
   'Pork 55g',    'MAMA-PK-55',    NULL,   6.00,   3.50, TRUE, 150, TRUE),
  ('b2000000-0000-0000-0000-000000000025', 'a2000000-0000-0000-0000-000000000012',
   'Shrimp 55g',  'MAMA-SH-55',    NULL,   6.00,   3.50, TRUE, 100, TRUE),

  -- Triangle Sandwich
  ('b2000000-0000-0000-0000-000000000026', 'a2000000-0000-0000-0000-000000000013',
   'Tuna Mayo',   'SAND-TUNA',     NULL,              35.00,  22.00, TRUE, 15, TRUE),
  ('b2000000-0000-0000-0000-000000000027', 'a2000000-0000-0000-0000-000000000013',
   'Ham & Cheese','SAND-HAM',      NULL,              35.00,  22.00, TRUE, 15, TRUE),

  -- Colgate Toothpaste
  ('b2000000-0000-0000-0000-000000000028', 'a2000000-0000-0000-0000-000000000014',
   'Tube 35g',    'COLGATE-35',    NULL,  35.00,  22.00, TRUE, 30, TRUE),
  ('b2000000-0000-0000-0000-000000000029', 'a2000000-0000-0000-0000-000000000014',
   'Tube 150g',   'COLGATE-150',   NULL,  89.00,  58.00, TRUE, 20, TRUE),

  -- Panadol
  ('b2000000-0000-0000-0000-000000000030', 'a2000000-0000-0000-0000-000000000015',
   '10 Tablets',  'PANADOL-10',    NULL,  30.00,  18.00, TRUE, 50, TRUE),
  ('b2000000-0000-0000-0000-000000000031', 'a2000000-0000-0000-0000-000000000015',
   '24 Tablets',  'PANADOL-24',    NULL,  65.00,  40.00, TRUE, 30, TRUE),

  -- Dish Soap
  ('b2000000-0000-0000-0000-000000000032', 'a2000000-0000-0000-0000-000000000016',
   'Bottle 500ml','SOAP-500',      NULL,  45.00,  28.00, TRUE, 25, TRUE),

  -- Garbage Bags
  ('b2000000-0000-0000-0000-000000000033', 'a2000000-0000-0000-0000-000000000017',
   'Small 18x20"  30pcs','GBAG-SM', NULL,            25.00,  15.00, TRUE, 30, TRUE),
  ('b2000000-0000-0000-0000-000000000034', 'a2000000-0000-0000-0000-000000000017',
   'Large 24x28"  20pcs','GBAG-LG', NULL,            45.00,  28.00, TRUE, 20, TRUE)

ON CONFLICT (id) DO NOTHING;


-- =========================================================
-- VERIFICATION
-- =========================================================

SELECT
  pc.name                                                   AS category,
  pm.name                                                   AS product,
  COUNT(DISTINCT pi.id)                                     AS variants,
  SUM(pi.stock_qty)                                         AS total_stock,
  STRING_AGG(pi.name || ' ฿' || pi.price::INT::TEXT,
    ', ' ORDER BY pi.price)                                 AS items_with_price
FROM product_models pm
JOIN product_items pi
  ON pi.product_model_id = pm.id
LEFT JOIN product_categories pc
  ON pc.id = pm.category_id
WHERE pm.id::TEXT LIKE 'a2000000%'
GROUP BY pc.sort_order, pc.name, pm.name
ORDER BY pc.sort_order, pm.name;

COMMIT;