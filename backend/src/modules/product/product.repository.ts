// =========================================================
// product.repository.ts
// Path: backend/src/modules/product/product.repository.ts
// =========================================================
// ALL raw SQL for products and inventory.
// Service layer never imports pool directly.
// =========================================================

import { pool } from "../../db/pool.js";
import { appError } from "../../utils/appError.js";
import {
  ProductModel,
  ProductItem,
  InventoryMovement,
  CreateProductModelInput,
  UpdateProductModelInput,
  CreateProductItemInput,
  UpdateProductItemInput,
  CreateInventoryMovementInput,
} from "./product.types.js";

export class ProductRepository {

  // =======================================================
  // PRODUCT MODELS
  // =======================================================

  /**
   * Create a new product model for a shop.
   */
  static async createModel(input: CreateProductModelInput): Promise<ProductModel> {
    const { shopId, name, description, image_url } = input;

    const result = await pool.query<ProductModel>(
      `
      INSERT INTO product_models (shop_id, name, description, image_url)
      VALUES ($1, $2, $3, $4)
      RETURNING *
      `,
      [shopId, name, description ?? null, image_url ?? null]
    );

    return result.rows[0];
  }

  /**
   * List all active (non-deleted) models for a shop.
   */
  static async findAllModels(shopId: string): Promise<ProductModel[]> {
    const result = await pool.query<ProductModel>(
      `
      SELECT *
      FROM product_models
      WHERE shop_id = $1
        AND is_deleted = false
      ORDER BY created_at DESC
      `,
      [shopId]
    );

    return result.rows;
  }

  /**
   * Find a single model by ID, scoped to a shop.
   * Returns null if not found or soft-deleted.
   */
  static async findModelById(
    modelId: string,
    shopId: string
  ): Promise<ProductModel | null> {
    const result = await pool.query<ProductModel>(
      `
      SELECT *
      FROM product_models
      WHERE id = $1
        AND shop_id = $2
        AND is_deleted = false
      `,
      [modelId, shopId]
    );

    return result.rows[0] ?? null;
  }

  /**
   * Update a model's editable fields.
   * COALESCE keeps old value if new value is null (partial update).
   */
  static async updateModel(
    modelId: string,
    shopId: string,
    input: UpdateProductModelInput
  ): Promise<ProductModel | null> {
    const result = await pool.query<ProductModel>(
      `
      UPDATE product_models
      SET
        name        = COALESCE($3, name),
        description = COALESCE($4, description),
        image_url   = COALESCE($5, image_url),
        updated_at  = now()
      WHERE id      = $1
        AND shop_id = $2
        AND is_deleted = false
      RETURNING *
      `,
      [
        modelId,
        shopId,
        input.name        ?? null,
        input.description ?? null,
        input.image_url   ?? null,
      ]
    );

    return result.rows[0] ?? null;
  }

  /**
   * Soft-delete a model (sets is_deleted = true).
   * Hard delete is never used — historical order snapshots need the data.
   */
  static async softDeleteModel(
    modelId: string,
    shopId: string
  ): Promise<boolean> {
    const result = await pool.query(
      `
      UPDATE product_models
      SET is_deleted = true,
          updated_at = now()
      WHERE id      = $1
        AND shop_id = $2
        AND is_deleted = false
      `,
      [modelId, shopId]
    );

    return (result.rowCount ?? 0) > 0;
  }

  /**
   * Restore a soft-deleted model.
   */
  static async restoreModel(
    modelId: string,
    shopId: string
  ): Promise<boolean> {
    const result = await pool.query(
      `
      UPDATE product_models
      SET is_deleted = false,
          updated_at = now()
      WHERE id      = $1
        AND shop_id = $2
        AND is_deleted = true
      `,
      [modelId, shopId]
    );

    return (result.rowCount ?? 0) > 0;
  }

  // =======================================================
  // PRODUCT ITEMS (SKUs)
  // =======================================================

  /**
   * Create a product item under a model.
   */
  static async createItem(input: CreateProductItemInput): Promise<ProductItem> {
    const {
      productModelId,
      name,
      sku,
      barcode,
      price,
      cost_price,
      track_stock,
      stock_qty,
    } = input;

    try {
    const result = await pool.query<ProductItem>(
      `
      INSERT INTO product_items
        (product_model_id, name, sku, barcode, price, cost_price, track_stock, stock_qty)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
      `,
      [
        productModelId,
        name,
        sku        ?? null,
        barcode    ?? null,
        price,
        cost_price ?? null,
        track_stock ?? true,
        stock_qty  ?? 0,
      ]
    );

    return result.rows[0];

  } catch (err: any) {
    // PostgreSQL unique violation error code is 23505
    // Check which constraint was violated and throw a clean error
    if (err.code === "23505") {
      if (err.constraint?.includes("barcode")) {
        throw new Error("BARCODE_ALREADY_EXISTS");
      }
      if (err.constraint?.includes("sku")) {
        throw new Error("SKU_ALREADY_EXISTS");
      }
      throw new Error("DUPLICATE_ENTRY");
    }
    // Any other DB error — rethrow so global handler catches it
    throw err;
  }
}

  /**
   * List all items under a model (active + inactive, not deleted).
   * Deleted models cascade — so we only filter by model_id.
   */
  static async findItemsByModel(modelId: string): Promise<ProductItem[]> {
    const result = await pool.query<ProductItem>(
      `
      SELECT pi.*
      FROM product_items pi
      JOIN product_models pm ON pm.id = pi.product_model_id
      WHERE pi.product_model_id = $1
        AND pm.is_deleted = false
      ORDER BY pi.created_at DESC
      `,
      [modelId]
    );

    return result.rows;
  }

  /**
   * Find a single item by ID, verified against shopId for security.
   * JOIN through product_models ensures the item belongs to the shop.
   */
  static async findItemById(
    itemId: string,
    shopId: string
  ): Promise<ProductItem | null> {
    const result = await pool.query<ProductItem>(
      `
      SELECT pi.*
      FROM product_items pi
      JOIN product_models pm ON pm.id = pi.product_model_id
      WHERE pi.id     = $1
        AND pm.shop_id = $2
        AND pm.is_deleted = false
      `,
      [itemId, shopId]
    );

    return result.rows[0] ?? null;
  }

  /**
   * Update editable fields on a product item.
   */
  static async updateItem(
    itemId: string,
    shopId: string,
    input: UpdateProductItemInput
  ): Promise<ProductItem | null> {
    const result = await pool.query<ProductItem>(
      `
      UPDATE product_items pi
      SET
        name       = COALESCE($3, pi.name),
        sku        = COALESCE($4, pi.sku),
        barcode    = COALESCE($5, pi.barcode),
        price      = COALESCE($6, pi.price),
        cost_price = COALESCE($7, pi.cost_price),
        track_stock = COALESCE($8, pi.track_stock),
        updated_at = now()
      FROM product_models pm
      WHERE pi.id          = $1
        AND pm.id          = pi.product_model_id
        AND pm.shop_id     = $2
        AND pm.is_deleted  = false
      RETURNING pi.*
      `,
      [
        itemId,
        shopId,
        input.name        ?? null,
        input.sku         ?? null,
        input.barcode     ?? null,
        input.price       ?? null,
        input.cost_price  ?? null,
        input.track_stock ?? null,
      ]
    );

    return result.rows[0] ?? null;
  }

  /**
   * Soft-delete a product item.
   * is_active = false is for temp unavailability; is_deleted = true is permanent.
   */
  static async softDeleteItem(
    itemId: string,
    shopId: string
  ): Promise<boolean> {
    const result = await pool.query(
      `
      UPDATE product_items pi
      SET is_active  = false,
          updated_at = now()
      FROM product_models pm
      WHERE pi.id         = $1
        AND pm.id         = pi.product_model_id
        AND pm.shop_id    = $2
        AND pm.is_deleted = false
      `,
      [itemId, shopId]
    );

    return (result.rowCount ?? 0) > 0;
  }

  /**
   * Toggle is_active on a product item.
   * Used for "temporarily unavailable" without deleting.
   */
  static async setItemActive(
    itemId: string,
    shopId: string,
    isActive: boolean
  ): Promise<ProductItem | null> {
    const result = await pool.query<ProductItem>(
      `
      UPDATE product_items pi
      SET is_active  = $3,
          updated_at = now()
      FROM product_models pm
      WHERE pi.id         = $1
        AND pm.id         = pi.product_model_id
        AND pm.shop_id    = $2
        AND pm.is_deleted = false
      RETURNING pi.*
      `,
      [itemId, shopId, isActive]
    );

    return result.rows[0] ?? null;
  }

  // =======================================================
  // INVENTORY MOVEMENTS
  // =======================================================

  /**
   * Deduct or add stock atomically using SELECT FOR UPDATE.
   *
   * Why FOR UPDATE?
   *   Two cashiers processing orders simultaneously could both read
   *   stock_qty = 1 and both decrement it → stock goes to -1.
   *   FOR UPDATE locks the row until the transaction commits,
   *   so the second request waits and sees stock_qty = 0.
   *
   * quantity convention:
   *   SALE / REFUND_OUT → negative  (stock leaves)
   *   PURCHASE / ADJUSTMENT_IN → positive  (stock arrives)
   */
  static async createMovementWithStockUpdate(
    input: CreateInventoryMovementInput
  ): Promise<InventoryMovement> {
    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      // Lock the item row for this transaction
      const lockResult = await client.query(
        `
        SELECT id, stock_qty, track_stock
        FROM product_items
        WHERE id = $1
        FOR UPDATE
        `,
        [input.productItemId]
      );

      if (lockResult.rows.length === 0) {
        throw new Error("ITEM_NOT_FOUND");
      }

      const item = lockResult.rows[0];

      // Only enforce stock guard for tracked items
      if (item.track_stock) {
        const newQty = item.stock_qty + input.quantity;

        // stock_qty CHECK (stock_qty >= 0) would catch this at DB level too,
        // but throwing here gives a cleaner error message to the caller
        if (newQty < 0) {
           throw new appError("INSUFFICIENT_STOCK", 409);
        }

        await client.query(
          `
          UPDATE product_items
          SET stock_qty  = stock_qty + $1,
              updated_at = now()
          WHERE id = $2
          `,
          [input.quantity, input.productItemId]
        );
      }

      // Append to the inventory ledger
      const movResult = await client.query<InventoryMovement>(
        `
        INSERT INTO inventory_movements
          (shop_id, product_item_id, type, quantity, reference_id, notes, created_by)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *
        `,
        [
          input.shopId,
          input.productItemId,
          input.type,
          input.quantity,
          input.reference_id ?? null,
          input.notes        ?? null,
          input.createdBy,
        ]
      );

      await client.query("COMMIT");

      return movResult.rows[0];
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      // Always release the client back to the pool
      client.release();
    }
  }

  /**
   * List all inventory movements for an item (newest first).
   */
  static async findMovementsByItem(
    itemId: string,
    shopId: string
  ): Promise<InventoryMovement[]> {
    const result = await pool.query<InventoryMovement>(
      `
      SELECT im.*
      FROM inventory_movements im
      JOIN product_items pi ON pi.id = im.product_item_id
      JOIN product_models pm ON pm.id = pi.product_model_id
      WHERE im.product_item_id = $1
        AND im.shop_id         = $2
        AND pm.is_deleted      = false
      ORDER BY im.created_at DESC
      `,
      [itemId, shopId]
    );

    return result.rows;
  }

  // =======================================================
  // MODIFIER LINKING (product_model ↔ modifier_group)
  // =======================================================

  /**
   * Link an existing modifier group to a product model.
   * Uses ON CONFLICT DO NOTHING so duplicate links are safe.
   */
  static async linkModifierGroup(
    modelId: string,
    groupId: string
  ): Promise<void> {
    await pool.query(
      `
      INSERT INTO product_model_modifier_groups (product_model_id, modifier_group_id)
      VALUES ($1, $2)
      ON CONFLICT DO NOTHING
      `,
      [modelId, groupId]
    );
  }

  /**
   * List all modifier groups linked to a product model.
   */
  static async findLinkedModifierGroups(modelId: string) {
    const result = await pool.query(
      `
      SELECT mg.*
      FROM modifier_groups mg
      JOIN product_model_modifier_groups pmg
        ON pmg.modifier_group_id = mg.id
      WHERE pmg.product_model_id = $1
      ORDER BY mg.sort_order ASC, mg.created_at ASC
      `,
      [modelId]
    );

    return result.rows;
  }

  /**
   * Remove the link between a product model and a modifier group.
   */
  static async unlinkModifierGroup(
    modelId: string,
    groupId: string
  ): Promise<boolean> {
    const result = await pool.query(
      `
      DELETE FROM product_model_modifier_groups
      WHERE product_model_id  = $1
        AND modifier_group_id = $2
      `,
      [modelId, groupId]
    );

    return (result.rowCount ?? 0) > 0;
  }
}