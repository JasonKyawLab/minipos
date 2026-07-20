-- Deduplicate product_models within each shop before adding the unique constraint.
-- Keeps the first-created row unchanged; renames subsequent duplicates with (2), (3), etc.
DO $$
DECLARE
  rec RECORD;
  new_name TEXT;
  suffix INT;
BEGIN
  FOR rec IN
    SELECT id, shop_id, name,
           ROW_NUMBER() OVER (PARTITION BY shop_id, lower(name) ORDER BY created_at, id) AS rn
    FROM product_models
    WHERE is_deleted = false
      AND (shop_id, lower(name)) IN (
        SELECT shop_id, lower(name)
        FROM product_models
        WHERE is_deleted = false
        GROUP BY shop_id, lower(name)
        HAVING COUNT(*) > 1
      )
  LOOP
    IF rec.rn > 1 THEN
      suffix := rec.rn;
      new_name := rec.name || ' (' || suffix || ')';
      -- Ensure the generated name is also unique (edge case: "Blue Shirt (2)" already exists)
      WHILE EXISTS (
        SELECT 1 FROM product_models
        WHERE shop_id = rec.shop_id AND lower(name) = lower(new_name) AND is_deleted = false AND id <> rec.id
      ) LOOP
        suffix := suffix + 1;
        new_name := rec.name || ' (' || suffix || ')';
      END LOOP;
      UPDATE product_models SET name = new_name WHERE id = rec.id;
      RAISE NOTICE 'Renamed product % to "%"', rec.id, new_name;
    END IF;
  END LOOP;
END $$;

-- No unique constraint added — duplicate names are allowed but warned in the UI.
