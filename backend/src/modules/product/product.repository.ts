import { pool } from "../../db/pool.js";
import { appError } from "../../utils/appError.js";
import { PaginationParams } from "../../utils/pagination.js";
import {
  ProductCategory,
  ProductModel,
  ProductItem,
  InventoryMovement,
  CreateProductCategoryInput,
  UpdateProductCategoryInput,
  CreateProductModelInput,
  UpdateProductModelInput,
  CreateProductItemInput,
  UpdateProductItemInput,
  CreateInventoryMovementInput,
} from "./product.types.js";

export class ProductRepository {

  // =======================================================
  // PRODUCT CATEGORIES
  // =======================================================

  static async createCategory(input: CreateProductCategoryInput): Promise<ProductCategory> {
    const { shopId, name, color, image_url } = input;
    const result = await pool.query<ProductCategory>(
      `
      INSERT INTO product_categories (shop_id, name, color, image_url, sort_order)
      SELECT $1, $2, $3, $4,
        COALESCE((SELECT MAX(sort_order) + 1 FROM product_categories WHERE shop_id = $1), 0)
      RETURNING *
      `,
      [shopId, name, color ?? null, image_url ?? null]
    );
    return result.rows[0];
  }

  static async findAllCategories(shopId: string): Promise<ProductCategory[]> {
    const result = await pool.query<ProductCategory>(
      `
      SELECT *
      FROM product_categories
      WHERE shop_id  = $1
        AND is_deleted = false
      ORDER BY sort_order ASC, created_at ASC
      `,
      [shopId]
    );
    return result.rows;
  }

  static async findCategoryById(
    categoryId: string,
    shopId: string
  ): Promise<ProductCategory | null> {
    const result = await pool.query<ProductCategory>(
      `
      SELECT * FROM product_categories
      WHERE id = $1 AND shop_id = $2 AND is_deleted = false
      `,
      [categoryId, shopId]
    );
    return result.rows[0] ?? null;
  }

  static async updateCategory(
    categoryId: string,
    shopId: string,
    input: UpdateProductCategoryInput
  ): Promise<ProductCategory | null> {
    const result = await pool.query<ProductCategory>(
      `
      UPDATE product_categories
      SET
        name       = COALESCE($3, name),
        color      = COALESCE($4, color),
        image_url  = COALESCE($5, image_url),
        sort_order = COALESCE($6, sort_order),
        updated_at = now()
      WHERE id      = $1
        AND shop_id = $2
        AND is_deleted = false
      RETURNING *
      `,
      [
        categoryId, shopId,
        input.name       ?? null,
        input.color      ?? null,
        input.image_url  ?? null,
        input.sort_order ?? null,
      ]
    );
    return result.rows[0] ?? null;
  }

  /**
   * Soft-delete a category.
   * Products in this category have category_id set to NULL
   * automatically (ON DELETE SET NULL in the FK definition).
   */
  static async softDeleteCategory(
    categoryId: string,
    shopId: string
  ): Promise<boolean> {
    const result = await pool.query(
      `
      UPDATE product_categories
      SET is_deleted = true, updated_at = now()
      WHERE id = $1 AND shop_id = $2 AND is_deleted = false
      `,
      [categoryId, shopId]
    );
    return (result.rowCount ?? 0) > 0;
  }

  // =======================================================
  // PRODUCT MODELS
  // =======================================================

  static async createModel(input: CreateProductModelInput): Promise<ProductModel> {
    const { shopId, name, description, image_url, category_id } = input;
    const result = await pool.query<ProductModel>(
      `
      INSERT INTO product_models (shop_id, name, description, image_url, category_id)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
      `,
      [shopId, name, description ?? null, image_url ?? null, category_id ?? null]
    );
    return result.rows[0];
  }

  /**
   * List all active models with their category name and color.
   * LEFT JOIN so products without a category still appear.
   */
  static async findAllModels(
    shopId: string,
    pagination: PaginationParams,
    search?: string,
    categoryId?: string
  ): Promise<{ rows: ProductModel[]; totalCount: number }> {
    const conditions: string[] = ["pm.shop_id = $1", "pm.is_deleted = false"];
    const values: any[]        = [shopId];
    let idx = 2;

    if (search) {
      conditions.push(`pm.name ILIKE $${idx++}`);
      values.push(`%${search}%`);
    }

    if (categoryId) {
      conditions.push(`pm.category_id = $${idx++}`);
      values.push(categoryId);
    }

    const result = await pool.query<ProductModel & { total_count: string }>(
      `
      SELECT
        pm.*,
        pc.name  AS category_name,
        pc.color AS category_color,
        COUNT(*) OVER() AS total_count
      FROM product_models pm
      LEFT JOIN product_categories pc
        ON pc.id = pm.category_id AND pc.is_deleted = false
      WHERE ${conditions.join(" AND ")}
      ORDER BY pc.sort_order ASC NULLS LAST, pm.created_at DESC
      LIMIT $${idx++} OFFSET $${idx++}
      `,
      [...values, pagination.limit, pagination.offset]
    );

    const totalCount = result.rows[0] ? parseInt(result.rows[0].total_count, 10) : 0;
    const rows = result.rows.map(({ total_count, ...row }) => row as ProductModel);

    return { rows, totalCount };
  }

  static async findModelById(
    modelId: string,
    shopId: string
  ): Promise<ProductModel | null> {
    const result = await pool.query<ProductModel>(
      `
      SELECT pm.*, pc.name AS category_name, pc.color AS category_color
      FROM product_models pm
      LEFT JOIN product_categories pc
        ON pc.id = pm.category_id AND pc.is_deleted = false
      WHERE pm.id      = $1
        AND pm.shop_id = $2
        AND pm.is_deleted = false
      `,
      [modelId, shopId]
    );
    return result.rows[0] ?? null;
  }

  static async updateModel(
    modelId: string,
    shopId: string,
    input: UpdateProductModelInput
  ): Promise<ProductModel | null> {
    // category_id is handled specially:
    //   undefined → keep existing value (COALESCE)
    //   null      → explicitly set to NULL (uncategorise)
    //   uuid      → assign to new category
    const categoryClause = "category_id" in input
      ? ", category_id = $6"
      : "";

    const params: any[] = [
      modelId, shopId,
      input.name        ?? null,
      input.description ?? null,
      input.image_url   ?? null,
    ];
    if ("category_id" in input) params.push(input.category_id ?? null);

    const result = await pool.query<ProductModel>(
      `
      UPDATE product_models
      SET
        name        = COALESCE($3, name),
        description = COALESCE($4, description),
        image_url   = COALESCE($5, image_url)
        ${categoryClause},
        updated_at  = now()
      WHERE id      = $1
        AND shop_id = $2
        AND is_deleted = false
      RETURNING *
      `,
      params
    );
    return result.rows[0] ?? null;
  }

  static async softDeleteModel(modelId: string, shopId: string): Promise<boolean> {
    const result = await pool.query(
      `
      UPDATE product_models
      SET is_deleted = true, updated_at = now()
      WHERE id = $1 AND shop_id = $2 AND is_deleted = false
      `,
      [modelId, shopId]
    );
    return (result.rowCount ?? 0) > 0;
  }

  static async restoreModel(modelId: string, shopId: string): Promise<boolean> {
    const result = await pool.query(
      `
      UPDATE product_models
      SET is_deleted = false, updated_at = now()
      WHERE id = $1 AND shop_id = $2 AND is_deleted = true
      `,
      [modelId, shopId]
    );
    return (result.rowCount ?? 0) > 0;
  }

  // =======================================================
  // PRODUCT ITEMS (SKUs)
  // =======================================================

  static async createItem(input: CreateProductItemInput): Promise<ProductItem> {
    const { productModelId, name, sku, barcode, price, cost_price, track_stock, stock_qty } = input;
    try {
      const result = await pool.query<ProductItem>(
        `
        INSERT INTO product_items
          (product_model_id, name, sku, barcode, price, cost_price, track_stock, stock_qty)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *
        `,
        [productModelId, name, sku ?? null, barcode ?? null, price,
         cost_price ?? null, track_stock ?? true, stock_qty ?? 0]
      );
      return result.rows[0];
    } catch (err: any) {
      if (err.code === "23505") {
        if (err.constraint?.includes("barcode")) throw new appError("BARCODE_ALREADY_EXISTS", 409);
        if (err.constraint?.includes("sku"))     throw new appError("SKU_ALREADY_EXISTS", 409);
        throw new appError("DUPLICATE_ENTRY", 409);
      }
      throw err;
    }
  }

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

  static async findItemById(itemId: string, shopId: string): Promise<ProductItem | null> {
    const result = await pool.query<ProductItem>(
      `
      SELECT pi.*
      FROM product_items pi
      JOIN product_models pm ON pm.id = pi.product_model_id
      WHERE pi.id      = $1
        AND pm.shop_id = $2
        AND pm.is_deleted = false
      `,
      [itemId, shopId]
    );
    return result.rows[0] ?? null;
  }

  static async updateItem(
    itemId: string, shopId: string, input: UpdateProductItemInput
  ): Promise<ProductItem | null> {
    const result = await pool.query<ProductItem>(
      `
      UPDATE product_items pi
      SET
        name        = COALESCE($3, pi.name),
        sku         = COALESCE($4, pi.sku),
        barcode     = COALESCE($5, pi.barcode),
        price       = COALESCE($6, pi.price),
        cost_price  = COALESCE($7, pi.cost_price),
        track_stock = COALESCE($8, pi.track_stock),
        updated_at  = now()
      FROM product_models pm
      WHERE pi.id         = $1
        AND pm.id         = pi.product_model_id
        AND pm.shop_id    = $2
        AND pm.is_deleted = false
      RETURNING pi.*
      `,
      [itemId, shopId,
       input.name ?? null, input.sku ?? null, input.barcode ?? null,
       input.price ?? null, input.cost_price ?? null, input.track_stock ?? null]
    );
    return result.rows[0] ?? null;
  }

  static async softDeleteItem(itemId: string, shopId: string): Promise<boolean> {
    const result = await pool.query(
      `
      UPDATE product_items pi
      SET is_active = false, updated_at = now()
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

  static async setItemActive(itemId: string, shopId: string, isActive: boolean): Promise<ProductItem | null> {
    const result = await pool.query<ProductItem>(
      `
      UPDATE product_items pi
      SET is_active = $3, updated_at = now()
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

  static async createMovementWithStockUpdate(
    input: CreateInventoryMovementInput
  ): Promise<InventoryMovement> {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const lockResult = await client.query(
        `SELECT id, stock_qty, track_stock FROM product_items WHERE id = $1 FOR UPDATE`,
        [input.productItemId]
      );
      if (lockResult.rows.length === 0) throw new appError("ITEM_NOT_FOUND", 404);
      const item = lockResult.rows[0];
      if (item.track_stock) {
        const newQty = item.stock_qty + input.quantity;
        if (newQty < 0) throw new appError("INSUFFICIENT_STOCK", 409);
        await client.query(
          `UPDATE product_items SET stock_qty = stock_qty + $1, updated_at = now() WHERE id = $2`,
          [input.quantity, input.productItemId]
        );
      }
      const movResult = await client.query<InventoryMovement>(
        `
        INSERT INTO inventory_movements
          (shop_id, product_item_id, type, quantity, reference_id, notes, created_by)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *
        `,
        [input.shopId, input.productItemId, input.type, input.quantity,
         input.reference_id ?? null, input.notes ?? null, input.createdBy]
      );
      await client.query("COMMIT");
      return movResult.rows[0];
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  static async findMovementsByItem(itemId: string, shopId: string): Promise<InventoryMovement[]> {
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
  // MODIFIER LINKING
  // =======================================================

  static async linkModifierGroup(modelId: string, groupId: string): Promise<void> {
    await pool.query(
      `
      INSERT INTO product_model_modifier_groups (product_model_id, modifier_group_id)
      VALUES ($1, $2)
      ON CONFLICT DO NOTHING
      `,
      [modelId, groupId]
    );
  }

  static async findLinkedModifierGroups(modelId: string) {
    const result = await pool.query(
      `
      SELECT mg.*
      FROM modifier_groups mg
      JOIN product_model_modifier_groups pmg ON pmg.modifier_group_id = mg.id
      WHERE pmg.product_model_id = $1
      ORDER BY mg.sort_order ASC, mg.created_at ASC
      `,
      [modelId]
    );
    return result.rows;
  }

  static async unlinkModifierGroup(modelId: string, groupId: string): Promise<boolean> {
    const result = await pool.query(
      `
      DELETE FROM product_model_modifier_groups
      WHERE product_model_id = $1 AND modifier_group_id = $2
      `,
      [modelId, groupId]
    );
    return (result.rowCount ?? 0) > 0;
  }
}