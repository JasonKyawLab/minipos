//
// BUG FIX: NULL + 1 = NULL in incrementKitchenTokenVersion
// (Same root cause as pos-auth.repository.ts — see that file.)
//
// FIX:
//   SET kitchen_token_version = COALESCE(kitchen_token_version, 0) + 1

import { pool } from "../../db/pool.js";

// Note: CHEF is not in the DB shop_role enum (which only has OWNER/MANAGER/CASHIER/CHEF).
// MANAGER can use both the POS and the Kitchen Display.
// CASHIER is explicitly excluded — they cannot log into the kitchen.
const KITCHEN_ALLOWED_ROLES = ["OWNER", "MANAGER", "CHEF"] as const;

export class KitchenAuthRepository {

  // Returns staff who are allowed to log into the kitchen display.
  // Excludes CASHIER role entirely — they are not kitchen staff.
  static async getKitchenStaffList(shopId: string) {
    const { rows } = await pool.query(
      `
      SELECT
        su.user_id,
        u.name,
        su.role,
        (su.kitchen_pin_hash IS NOT NULL)                             AS has_pin,
        (su.kitchen_pin_locked_until IS NOT NULL
          AND su.kitchen_pin_locked_until > now())                    AS is_locked
      FROM shop_users su
      JOIN users u ON u.id = su.user_id
      WHERE su.shop_id   = $1
        AND su.is_active = true
        AND su.role      = ANY($2::shop_role[])
        AND u.is_deleted = false
      ORDER BY su.role ASC, u.name ASC
      `,
      [shopId, KITCHEN_ALLOWED_ROLES]
    );
    return rows;
  }

  static async getMembership(shopId: string, userId: string) {
    const { rows } = await pool.query(
      `
      SELECT
        su.role,
        su.is_active,
        su.kitchen_pin_hash,
        su.kitchen_pin_attempts,
        su.kitchen_pin_locked_until,
        su.kitchen_token_version,
        u.name,
        s.name AS shop_name
      FROM shop_users su
      JOIN users  u ON u.id = su.user_id
      JOIN shops  s ON s.id = su.shop_id
      WHERE su.shop_id = $1
        AND su.user_id = $2
        AND su.role    = ANY($3::shop_role[])
      `,
      [shopId, userId, KITCHEN_ALLOWED_ROLES]
    );
    // Returns null if user is CASHIER — blocked at the query level
    return rows[0] ?? null;
  }

  // ── Increment token version (force logout) ───────────────
  //
  // FIX: COALESCE(kitchen_token_version, 0) + 1
  // Prevents NULL + 1 = NULL silently defeating force logout.
  static async incrementKitchenTokenVersion(
    shopId: string,
    userId: string
  ): Promise<boolean> {
    const result = await pool.query(
      `
      UPDATE shop_users
      SET kitchen_token_version = COALESCE(kitchen_token_version, 0) + 1
      WHERE shop_id   = $1
        AND user_id   = $2
        AND is_active = true
      `,
      [shopId, userId]
    );
    return (result.rowCount ?? 0) > 0;
  }

  static async setPin(shopId: string, userId: string, pinHash: string): Promise<boolean> {
    const result = await pool.query(
      `
      UPDATE shop_users
      SET kitchen_pin_hash         = $3,
          kitchen_pin_attempts     = 0,
          kitchen_pin_locked_until = NULL
      WHERE shop_id   = $1
        AND user_id   = $2
        AND is_active = true
        AND role      = ANY($4::shop_role[])
      `,
      [shopId, userId, pinHash, KITCHEN_ALLOWED_ROLES]
    );
    return (result.rowCount ?? 0) > 0;
  }

  static async removePin(shopId: string, userId: string): Promise<boolean> {
    const result = await pool.query(
      `
      UPDATE shop_users
      SET kitchen_pin_hash         = NULL,
          kitchen_pin_attempts     = 0,
          kitchen_pin_locked_until = NULL
      WHERE shop_id   = $1
        AND user_id   = $2
        AND is_active = true
        AND role      = ANY($3::shop_role[])
      `,
      [shopId, userId, KITCHEN_ALLOWED_ROLES]
    );
    return (result.rowCount ?? 0) > 0;
  }

  static async recordFailedAttempt(shopId: string, userId: string, maxAttempts: number): Promise<void> {
    await pool.query(
      `
      UPDATE shop_users
      SET
        kitchen_pin_attempts     = kitchen_pin_attempts + 1,
        kitchen_pin_locked_until = CASE
          WHEN kitchen_pin_attempts + 1 >= $3
          THEN now() + INTERVAL '15 minutes'
          ELSE kitchen_pin_locked_until
        END
      WHERE shop_id = $1
        AND user_id = $2
      `,
      [shopId, userId, maxAttempts]
    );
  }

  static async resetAttempts(shopId: string, userId: string): Promise<void> {
    await pool.query(
      `
      UPDATE shop_users
      SET kitchen_pin_attempts     = 0,
          kitchen_pin_locked_until = NULL
      WHERE shop_id = $1
        AND user_id = $2
      `,
      [shopId, userId]
    );
  }

  static async getShopPinMaxAttempts(shopId: string): Promise<number> {
    const { rows } = await pool.query(
      `SELECT pin_max_attempts FROM shops WHERE id = $1 AND is_deleted = false`,
      [shopId]
    );
    return rows[0]?.pin_max_attempts ?? 5;
  }

  static async resetStaffLock(shopId: string, targetUserId: string): Promise<boolean> {
    const result = await pool.query(
      `
      UPDATE shop_users
      SET kitchen_pin_attempts     = 0,
          kitchen_pin_locked_until = NULL
      WHERE shop_id   = $1
        AND user_id   = $2
        AND is_active = true
      `,
      [shopId, targetUserId]
    );
    return (result.rowCount ?? 0) > 0;
  }
}