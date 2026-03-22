// =========================================================
// modifier.repository.ts
// Path: backend/src/modules/modifier/modifier.repository.ts
// =========================================================

import { pool } from "../../db/pool.js";
import {
  ModifierGroup,
  ModifierOption,
  CreateModifierGroupInput,
  UpdateModifierGroupInput,
  CreateModifierOptionInput,
  UpdateModifierOptionInput,
} from "./modifier.types.js";

export class ModifierRepository {

  // =======================================================
  // MODIFIER GROUPS
  // =======================================================

  /**
   * Create a modifier group.
   * Groups are stored independently of product_models.
   * Linking is done via the product_model_modifier_groups join table.
   */
  static async createGroup(input: CreateModifierGroupInput): Promise<ModifierGroup> {
    const result = await pool.query<ModifierGroup>(
      `
      INSERT INTO modifier_groups
        (shop_id, name, is_required, min_select, max_select, sort_order)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
      `,
      [
        input.shopId,
        input.name,
        input.is_required ?? false,
        input.min_select  ?? 0,
        input.max_select  ?? 1,
        input.sort_order  ?? 0,
      ]
    );

    return result.rows[0];
  }

  /**
   * List all non-deleted groups for a shop.
   */
  static async findAllGroups(shopId: string): Promise<ModifierGroup[]> {
    const result = await pool.query<ModifierGroup>(
      `
      SELECT *
      FROM modifier_groups
      WHERE shop_id   = $1
        AND is_deleted = false
      ORDER BY sort_order ASC, created_at ASC
      `,
      [shopId]
    );

    return result.rows;
  }

  /**
   * Find one group by ID, scoped to a shop.
   */
  static async findGroupById(
    groupId: string,
    shopId: string
  ): Promise<ModifierGroup | null> {
    const result = await pool.query<ModifierGroup>(
      `
      SELECT *
      FROM modifier_groups
      WHERE id       = $1
        AND shop_id  = $2
        AND is_deleted = false
      `,
      [groupId, shopId]
    );

    return result.rows[0] ?? null;
  }

  /**
   * Update a modifier group's fields.
   */
  static async updateGroup(
    groupId: string,
    shopId: string,
    input: UpdateModifierGroupInput
  ): Promise<ModifierGroup | null> {
    const result = await pool.query<ModifierGroup>(
      `
      UPDATE modifier_groups
      SET
        name        = COALESCE($3, name),
        is_required = COALESCE($4, is_required),
        min_select  = COALESCE($5, min_select),
        max_select  = COALESCE($6, max_select),
        sort_order  = COALESCE($7, sort_order)
      WHERE id      = $1
        AND shop_id = $2
        AND is_deleted = false
      RETURNING *
      `,
      [
        groupId,
        shopId,
        input.name        ?? null,
        input.is_required ?? null,
        input.min_select  ?? null,
        input.max_select  ?? null,
        input.sort_order  ?? null,
      ]
    );

    return result.rows[0] ?? null;
  }

  /**
   * Soft-delete a modifier group.
   */
  static async softDeleteGroup(
    groupId: string,
    shopId: string
  ): Promise<boolean> {
    const result = await pool.query(
      `
      UPDATE modifier_groups
      SET is_deleted = true
      WHERE id      = $1
        AND shop_id = $2
        AND is_deleted = false
      `,
      [groupId, shopId]
    );

    return (result.rowCount ?? 0) > 0;
  }

  /**
   * Restore a soft-deleted modifier group.
   */
  static async restoreGroup(
    groupId: string,
    shopId: string
  ): Promise<boolean> {
    const result = await pool.query(
      `
      UPDATE modifier_groups
      SET is_deleted = false
      WHERE id      = $1
        AND shop_id = $2
        AND is_deleted = true
      `,
      [groupId, shopId]
    );

    return (result.rowCount ?? 0) > 0;
  }

  // =======================================================
  // MODIFIER OPTIONS
  // =======================================================

  /**
   * Create a modifier option inside a group.
   */
  static async createOption(
    input: CreateModifierOptionInput
  ): Promise<ModifierOption> {
    const result = await pool.query<ModifierOption>(
      `
      INSERT INTO modifier_options
        (group_id, name, price_delta, linked_product_item_id, sort_order)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
      `,
      [
        input.groupId,
        input.name,
        input.price_delta              ?? 0,
        input.linked_product_item_id   ?? null,
        input.sort_order               ?? 0,
      ]
    );

    return result.rows[0];
  }

  /**
   * List all active options for a group.
   * JOIN to modifier_groups so we can scope by shopId securely.
   */
  static async findOptionsByGroup(
    groupId: string,
    shopId: string
  ): Promise<ModifierOption[]> {
    const result = await pool.query<ModifierOption>(
      `
      SELECT mo.*
      FROM modifier_options mo
      JOIN modifier_groups mg ON mg.id = mo.group_id
      WHERE mo.group_id  = $1
        AND mg.shop_id   = $2
        AND mg.is_deleted = false
      ORDER BY mo.sort_order ASC, mo.created_at ASC
      `,
      [groupId, shopId]
    );

    return result.rows;
  }

  /**
   * Update a modifier option.
   * JOIN ensures option belongs to a group owned by this shop.
   */
  static async updateOption(
    optionId: string,
    shopId: string,
    input: UpdateModifierOptionInput
  ): Promise<ModifierOption | null> {
    const result = await pool.query<ModifierOption>(
      `
      UPDATE modifier_options mo
      SET
        name                   = COALESCE($3, mo.name),
        price_delta            = COALESCE($4, mo.price_delta),
        linked_product_item_id = COALESCE($5, mo.linked_product_item_id),
        is_active              = COALESCE($6, mo.is_active),
        sort_order             = COALESCE($7, mo.sort_order)
      FROM modifier_groups mg
      WHERE mo.id        = $1
        AND mg.id        = mo.group_id
        AND mg.shop_id   = $2
        AND mg.is_deleted = false
      RETURNING mo.*
      `,
      [
        optionId,
        shopId,
        input.name                   ?? null,
        input.price_delta            ?? null,
        input.linked_product_item_id ?? null,
        input.is_active              ?? null,
        input.sort_order             ?? null,
      ]
    );

    return result.rows[0] ?? null;
  }

  /**
   * Hard-delete a modifier option.
   * Options have no historical value (snapshots are stored in order_items),
   * so a hard delete is safe and keeps the table clean.
   */
  static async deleteOption(
    optionId: string,
    shopId: string
  ): Promise<boolean> {
    const result = await pool.query(
      `
      DELETE FROM modifier_options mo
      USING modifier_groups mg
      WHERE mo.id       = $1
        AND mg.id       = mo.group_id
        AND mg.shop_id  = $2
      `,
      [optionId, shopId]
    );

    return (result.rowCount ?? 0) > 0;
  }
}