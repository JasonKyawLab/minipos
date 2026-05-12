// =========================================================
// shop.repository.ts (additions only — add these methods)
// Path: backend/src/modules/shop/shop.repository.ts
//
// NEW: changeStaffRole() — changes a staff member's role
// within a shop. Used by the new role management endpoint.
//
// Note: The full file keeps all existing methods unchanged.
// Only changeStaffRole() is new.
// =========================================================

import { pool } from "../../db/pool.js";
import { Shop } from "./shop.types.js";

export interface CreateShopInput {
  ownerId: string;
  name: string;
  shopType: "RETAIL" | "RESTAURANT" | "ONLINE_SHOP";
  currency: "USD" | "SGD" | "THB" | "MMK" | "EUR";
}

// All roles that can be assigned to shop staff (not OWNER — set separately)
type AssignableRole = "MANAGER" | "CASHIER" | "CHEF";

export class ShopRepository {

  static async createShop(input: CreateShopInput): Promise<Shop> {
    const { ownerId, name, shopType, currency } = input;
    const result = await pool.query<Shop>(
      `
      INSERT INTO shops (owner_id, name, shop_type, currency)
      VALUES ($1, $2, $3, $4)
      RETURNING *
      `,
      [ownerId, name, shopType, currency]
    );
    return result.rows[0];
  }

  static async updateShop(params: {
    shopId: string;
    name?: string;
    currency?: string;
  }) {
    const result = await pool.query(
      `
      UPDATE shops
      SET
        name     = COALESCE($2, name),
        currency = COALESCE($3, currency),
        updated_at = now()
      WHERE id = $1
        AND is_deleted = false
      RETURNING *
      `,
      [params.shopId, params.name ?? null, params.currency ?? null]
    );
    return result.rows[0] ?? null;
  }

  static async findByOwnerId(ownerId: string): Promise<Shop[]> {
    const result = await pool.query<Shop>(
      `
      SELECT *
      FROM shops
      WHERE owner_id = $1
        AND is_deleted = false
      ORDER BY created_at DESC
      `,
      [ownerId]
    );
    return result.rows;
  }

  static async addUserToShop(params: {
    shop_id: string;
    user_id: string;
    role: "OWNER" | AssignableRole;
  }) {
    await pool.query(
      `
      INSERT INTO shop_users (shop_id, user_id, role)
      VALUES ($1, $2, $3)
      `,
      [params.shop_id, params.user_id, params.role]
    );
  }

  static async getUserShopMembership(shopId: string, userId: string) {
    const result = await pool.query(
      `
      SELECT su.role, su.is_active
      FROM shop_users su
      JOIN shops s ON s.id = su.shop_id
      WHERE su.shop_id = $1
        AND su.user_id = $2
        AND s.is_deleted = false
      `,
      [shopId, userId]
    );
    return result.rows[0] ?? null;
  }

  static async getShopStaff(shopId: string) {
    const result = await pool.query(
      `
      SELECT
        u.id,
        u.name,
        u.email,
        su.role,
        su.pos_pin_hash IS NOT NULL   AS has_pos_pin,
        su.kitchen_pin_hash IS NOT NULL AS has_kitchen_pin,
        (su.pos_pin_locked_until IS NOT NULL
          AND su.pos_pin_locked_until > now()) AS pos_pin_locked,
        (su.kitchen_pin_locked_until IS NOT NULL
          AND su.kitchen_pin_locked_until > now()) AS kitchen_pin_locked
      FROM shop_users su
      JOIN users u ON u.id = su.user_id
      JOIN shops s ON s.id = su.shop_id
      WHERE su.shop_id   = $1
        AND su.is_active = true
        AND s.is_deleted = false
        AND u.is_deleted = false
      ORDER BY
        CASE su.role
          WHEN 'OWNER'   THEN 1
          WHEN 'MANAGER' THEN 2
          WHEN 'CHEF'    THEN 3
          WHEN 'CASHIER' THEN 4
          ELSE 5
        END,
        u.name ASC
      `,
      [shopId]
    );
    return result.rows;
  }

  static async deactivateShopUser(shopId: string, userId: string) {
    const result = await pool.query(
      `
      UPDATE shop_users
      SET is_active = false
      WHERE shop_id = $1
        AND user_id = $2
        AND is_active = true
      `,
      [shopId, userId]
    );
    return result.rowCount;
  }

  static async activateShopUser(
    shopId: string,
    userId: string,
    role: AssignableRole
  ) {
    const result = await pool.query(
      `
      UPDATE shop_users
      SET is_active = true,
          role      = $3
      WHERE shop_id = $1
        AND user_id = $2
        AND is_active = false
      `,
      [shopId, userId, role]
    );
    return result.rowCount;
  }

  // ── NEW: Change a staff member's role ────────────────────
  // Updates the role column for an active shop_users row.
  //
  // Why a dedicated method?
  //   - Role changes need to be atomic (single UPDATE)
  //   - They also need to clear PINs that no longer apply
  //     (e.g. a CASHIER promoted to CHEF should lose their
  //     POS PIN since they can no longer log into POS mode)
  //   - Having this in the repository keeps the business
  //     logic decisions in the service layer
  //
  // Returns true if the role was changed, false if user
  // not found or not active.
  static async changeStaffRole(
    shopId:  string,
    userId:  string,
    newRole: AssignableRole
  ): Promise<boolean> {
    const result = await pool.query(
      `
      UPDATE shop_users
      SET role = $3
      WHERE shop_id  = $1
        AND user_id  = $2
        AND is_active = true
        AND role     != 'OWNER'   -- Owners cannot have their role changed here
      `,
      [shopId, userId, newRole]
    );
    return (result.rowCount ?? 0) > 0;
  }

  // ── NEW: Clear POS PIN when role no longer allows POS ────
  // Called when a CASHIER or MANAGER is changed to CHEF.
  // A CHEF cannot log into POS mode, so their POS PIN
  // should be cleared to avoid confusion and stale data.
  static async clearPosPinForUser(shopId: string, userId: string): Promise<void> {
    await pool.query(
      `
      UPDATE shop_users
      SET pos_pin_hash         = NULL,
          pos_pin_attempts     = 0,
          pos_pin_locked_until = NULL
      WHERE shop_id = $1
        AND user_id = $2
      `,
      [shopId, userId]
    );
  }

  // ── NEW: Clear Kitchen PIN when role no longer allows kitchen ──
  // Called when a CHEF is changed to CASHIER.
  // A CASHIER cannot log into Kitchen Mode, so their kitchen
  // PIN should be cleared.
  static async clearKitchenPinForUser(shopId: string, userId: string): Promise<void> {
    await pool.query(
      `
      UPDATE shop_users
      SET kitchen_pin_hash         = NULL,
          kitchen_pin_attempts     = 0,
          kitchen_pin_locked_until = NULL
      WHERE shop_id = $1
        AND user_id = $2
      `,
      [shopId, userId]
    );
  }

  static async softDeleteShop(shopId: string) {
    const result = await pool.query(
      `
      UPDATE shops
      SET is_deleted = true,
          updated_at = now()
      WHERE id = $1
        AND is_deleted = false
      `,
      [shopId]
    );
    return result.rowCount === 1;
  }
}