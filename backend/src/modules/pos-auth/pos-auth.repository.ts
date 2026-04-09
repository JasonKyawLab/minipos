// =========================================================
// Raw SQL only. No business logic.
//
// PIN storage notes:
//   - We store a bcrypt hash (cost 10), never the raw PIN.
//   - pin_attempts and pin_locked_until live on shop_users
//     (not users) because a person can be a cashier at shop A
//     and a manager at shop B with different PINs.
//   - Lock duration is hardcoded to 15 minutes at DB level.
//     The configurable part (pin_max_attempts) lives on shops.
// =========================================================

import { pool } from "../../db/pool.js";
import { StaffListItem } from "./pos-auth.types.js";

export class PosAuthRepository {

  // ── Staff list ───────────────────────────────────────────
  // Returns all active staff for the shop with PIN status.
  // has_pin and is_locked are computed in SQL so the app
  // layer never sees the raw hash.
  static async getStaffList(shopId: string): Promise<StaffListItem[]> {
    const { rows } = await pool.query(
      `
      SELECT
        su.user_id,
        u.name,
        su.role,
        (su.pos_pin_hash IS NOT NULL)                         AS has_pin,
        (su.pos_pin_locked_until IS NOT NULL
          AND su.pos_pin_locked_until > now())                AS is_locked
      FROM shop_users su
      JOIN users u ON u.id = su.user_id
      WHERE su.shop_id   = $1
        AND su.is_active = true
        AND u.is_deleted = false
      ORDER BY su.role ASC, u.name ASC
      `,
      [shopId]
    );
    return rows;
  }

  // ── Read own membership row ──────────────────────────────
  // Used by PIN set/remove to confirm the requester is
  // actually a member of this shop.
  static async getMembership(shopId: string, userId: string) {
    const { rows } = await pool.query(
      `
      SELECT
        su.role,
        su.is_active,
        su.pos_pin_hash,
        su.pos_pin_attempts,
        su.pos_pin_locked_until
      FROM shop_users su
      WHERE su.shop_id = $1
        AND su.user_id = $2
      `,
      [shopId, userId]
    );
    return rows[0] ?? null;
  }

  // ── Set PIN ──────────────────────────────────────────────
  // Stores the bcrypt hash and resets any lockout state.
  static async setPin(
    shopId:  string,
    userId:  string,
    pinHash: string
  ): Promise<boolean> {
    const result = await pool.query(
      `
      UPDATE shop_users
      SET pos_pin_hash         = $3,
          pos_pin_attempts     = 0,
          pos_pin_locked_until = NULL
      WHERE shop_id  = $1
        AND user_id  = $2
        AND is_active = true
      `,
      [shopId, userId, pinHash]
    );
    return (result.rowCount ?? 0) > 0;
  }

  // ── Remove PIN ───────────────────────────────────────────
  static async removePin(shopId: string, userId: string): Promise<boolean> {
    const result = await pool.query(
      `
      UPDATE shop_users
      SET pos_pin_hash         = NULL,
          pos_pin_attempts     = 0,
          pos_pin_locked_until = NULL
      WHERE shop_id  = $1
        AND user_id  = $2
        AND is_active = true
      `,
      [shopId, userId]
    );
    return (result.rowCount ?? 0) > 0;
  }

  // ── Record failed attempt ────────────────────────────────
  // Increments pin_attempts. If the new count reaches
  // maxAttempts, sets pin_locked_until = NOW() + 15 minutes.
  static async recordFailedAttempt(
    shopId:      string,
    userId:      string,
    maxAttempts: number
  ): Promise<void> {
    await pool.query(
      `
      UPDATE shop_users
      SET
        pos_pin_attempts     = pos_pin_attempts + 1,
        pos_pin_locked_until = CASE
          WHEN pos_pin_attempts + 1 >= $3
          THEN now() + INTERVAL '15 minutes'
          ELSE pos_pin_locked_until
        END
      WHERE shop_id = $1
        AND user_id = $2
      `,
      [shopId, userId, maxAttempts]
    );
  }

  // ── Reset attempts on success ────────────────────────────
  static async resetAttempts(shopId: string, userId: string): Promise<void> {
    await pool.query(
      `
      UPDATE shop_users
      SET pos_pin_attempts     = 0,
          pos_pin_locked_until = NULL
      WHERE shop_id = $1
        AND user_id = $2
      `,
      [shopId, userId]
    );
  }

  // ── Fetch shop's pin_max_attempts ────────────────────────
  static async getShopPinMaxAttempts(shopId: string): Promise<number> {
    const { rows } = await pool.query(
      `SELECT pin_max_attempts FROM shops WHERE id = $1 AND is_deleted = false`,
      [shopId]
    );
    return rows[0]?.pin_max_attempts ?? 5;
  }

  // ── Update shop pin_max_attempts (owner only) ────────────
  static async updateShopPinMaxAttempts(
    shopId:      string,
    maxAttempts: number
  ): Promise<boolean> {
    const result = await pool.query(
      `
      UPDATE shops
      SET pin_max_attempts = $2,
          updated_at       = now()
      WHERE id         = $1
        AND is_deleted = false
      `,
      [shopId, maxAttempts]
    );
    return (result.rowCount ?? 0) > 0;
  }

  // ── Owner resets a staff member's PIN lock ───────────────
  // Clears the lockout without removing the PIN itself.
  // Owner uses this when a cashier is locked out mid-shift.
  static async resetStaffLock(
    shopId:      string,
    targetUserId: string
  ): Promise<boolean> {
    const result = await pool.query(
      `
      UPDATE shop_users
      SET pos_pin_attempts     = 0,
          pos_pin_locked_until = NULL
      WHERE shop_id = $1
        AND user_id = $2
        AND is_active = true
      `,
      [shopId, targetUserId]
    );
    return (result.rowCount ?? 0) > 0;
  }

  static async incrementTokenVersion(
  shopId: string,
  userId: string
): Promise<boolean> {
  const result = await pool.query(
    `
    UPDATE shop_users
    SET pos_token_version = pos_token_version + 1
    WHERE shop_id = $1
      AND user_id = $2
      AND is_active = true
    `,
    [shopId, userId]
  );
  return (result.rowCount ?? 0) > 0;
}
}