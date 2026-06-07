// =========================================================
// qr.repository.ts
// Path: backend/src/modules/qr/qr.repository.ts
// =========================================================
// Read-only queries for the public QR menu.
// Never exposes cost_price, internal stock levels, or any
// data that isn't safe for a customer to see.
//
// Menu query design:
//   One query fetches product_models + product_items in a
//   single JOIN. We then group in JavaScript — this avoids
//   N+1 queries (one per model) and keeps the DB round-trips
//   to a minimum.
// =========================================================

import { pool } from "../../db/pool.js";
import {
  PublicMenuItem,
  PublicModifierGroup,
} from "./qr.types.js";

export class QrRepository {

  // ── Public Menu ──────────────────────────────────────────
  // Returns all active, non-deleted products for a shop with
  // their items and modifier groups.
  // One round-trip using two queries (products + modifiers).

  static async getPublicMenu(shopId: string): Promise<PublicMenuItem[]> {
 
    // Query 1: all active product models + their items + category data.
    // LEFT JOIN product_categories so products without a category
    // still appear (category fields will be null).
    const productsResult = await pool.query(
      `
      SELECT
        pm.id              AS product_model_id,
        pm.name            AS product_name,
        pm.description,
        pm.image_url,
        pm.category_id,
        pc.name            AS category_name,
        pc.color           AS category_color,
        pc.sort_order      AS category_sort_order,
        pi.id              AS item_id,
        pi.name            AS item_name,
        pi.price,
        pi.is_active       AS item_is_active,
        pi.is_sold_out
      FROM product_models pm
      JOIN product_items pi
        ON pi.product_model_id = pm.id
      LEFT JOIN product_categories pc
        ON pc.id = pm.category_id AND pc.is_deleted = false
      WHERE pm.shop_id    = $1
        AND pm.is_deleted = false
        AND pm.is_active  = true
        AND pi.is_active  = true
      ORDER BY
        pc.sort_order ASC NULLS LAST,
        pm.name ASC,
        pi.name ASC
      `,
      [shopId]
    );
 
    if (productsResult.rows.length === 0) return [];
 
    const menuMap = new Map<string, PublicMenuItem>();
 
    for (const row of productsResult.rows) {
      if (!menuMap.has(row.product_model_id)) {
        menuMap.set(row.product_model_id, {
          product_model_id:      row.product_model_id,
          product_name:          row.product_name,
          description:           row.description,
          image_url:             row.image_url,
          category_id:           row.category_id   ?? null,
          category_name:         row.category_name  ?? null,
          category_color:        row.category_color ?? null,
          category_sort_order:   row.category_sort_order ?? 999,
          items:                 [],
          modifier_groups:       [],
        });
      }
 
      menuMap.get(row.product_model_id)!.items.push({
        id:          row.item_id,
        name:        row.item_name,
        price:       parseFloat(row.price),
        is_active:   row.item_is_active,
        is_sold_out: row.is_sold_out,
      });
    }
 
    // Query 2: modifier groups + options (unchanged)
    const modelIds = Array.from(menuMap.keys());
 
    const modifiersResult = await pool.query(
      `
      SELECT
        pmg.product_model_id,
        mg.id              AS group_id,
        mg.name            AS group_name,
        mg.is_required,
        mg.min_select,
        mg.max_select,
        mg.sort_order      AS group_sort,
        mo.id              AS option_id,
        mo.name            AS option_name,
        mo.price_delta,
        mo.sort_order      AS option_sort
      FROM product_model_modifier_groups pmg
      JOIN modifier_groups mg  ON mg.id  = pmg.modifier_group_id
      JOIN modifier_options mo ON mo.group_id = mg.id
      WHERE pmg.product_model_id = ANY($1::uuid[])
        AND mg.is_deleted  = false
        AND mo.is_active   = true
      ORDER BY pmg.product_model_id, mg.sort_order, mo.sort_order
      `,
      [modelIds]
    );
 
    type GroupAccumulator = Map<string, PublicModifierGroup>;
    const modGroupsByModel = new Map<string, GroupAccumulator>();
 
    for (const row of modifiersResult.rows) {
      if (!modGroupsByModel.has(row.product_model_id)) {
        modGroupsByModel.set(row.product_model_id, new Map());
      }
      const groups = modGroupsByModel.get(row.product_model_id)!;
      if (!groups.has(row.group_id)) {
        groups.set(row.group_id, {
          id:          row.group_id,
          name:        row.group_name,
          is_required: row.is_required,
          min_select:  row.min_select,
          max_select:  row.max_select,
          options:     [],
        });
      }
      groups.get(row.group_id)!.options.push({
        id:          row.option_id,
        name:        row.option_name,
        price_delta: parseFloat(row.price_delta),
      });
    }
 
    for (const [modelId, groups] of modGroupsByModel) {
      const menuItem = menuMap.get(modelId);
      if (menuItem) {
        menuItem.modifier_groups = Array.from(groups.values());
      }
    }
 
    return Array.from(menuMap.values());
  }
 
}