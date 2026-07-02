//
// BUG FIX: NULL + 1 = NULL in incrementTokenVersion
//
// PROBLEM:
//   In PostgreSQL, NULL + 1 = NULL. If pos_token_version is
//   NULL (never explicitly set), the UPDATE silently sets the
//   column to NULL instead of 1. Force logout appears to
//   succeed (rowCount = 1) but the version never actually
//   increments, so the revoked token keeps working.
//
// FIX:
//   SET pos_token_version = COALESCE(pos_token_version, 0) + 1
//   COALESCE converts NULL → 0 first, then adds 1.
//   Result: NULL → 1, 0 → 1, 1 → 2, etc. ✓

import { pool } from "../../db/pool.js";
import { StaffListItem } from "./pos-auth.types.js";

// Roles that are allowed to log into the POS terminal.
// CHEF is intentionally excluded — they belong in Kitchen Mode only.
const POS_ALLOWED_ROLES = ["OWNER", "MANAGER", "CASHIER"] as const;

export class PosAuthRepository {

  // ── Staff list ───────────────────────────────────────────
  // Returns only POS-eligible staff. CHEF is excluded here
  // so they never appear on the POS PIN selection screen.
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
        AND su.role      = ANY($2::shop_role[])
        AND u.is_deleted = false
      ORDER BY su.role ASC, u.name ASC
      `,
      [shopId, POS_ALLOWED_ROLES]
    );
    return rows;
  }

  // ── Read own membership row ──────────────────────────────
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

  // ── Get membership with token version (for login) ────────
  // Separate query to avoid exposing token version in general membership reads.
  static async getMembershipWithTokenVersion(shopId: string, userId: string) {
    const { rows } = await pool.query(
      `
      SELECT
        su.role,
        su.is_active,
        su.pos_pin_hash,
        su.pos_pin_attempts,
        su.pos_pin_locked_until,
        su.pos_token_version
      FROM shop_users su
      WHERE su.shop_id = $1
        AND su.user_id = $2
      `,
      [shopId, userId]
    );
    return rows[0] ?? null;
  }

  // ── Set PIN ──────────────────────────────────────────────
  // Only works for POS-eligible roles. CHEF cannot have a POS PIN.
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
      WHERE shop_id   = $1
        AND user_id   = $2
        AND is_active = true
        AND role      = ANY($4::shop_role[])
      `,
      [shopId, userId, pinHash, POS_ALLOWED_ROLES]
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
      WHERE shop_id   = $1
        AND user_id   = $2
        AND is_active = true
        AND role      = ANY($3::shop_role[])
      `,
      [shopId, userId, POS_ALLOWED_ROLES]
    );
    return (result.rowCount ?? 0) > 0;
  }

  // ── Record failed attempt ────────────────────────────────
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
  static async resetStaffLock(
    shopId:       string,
    targetUserId: string
  ): Promise<boolean> {
    const result = await pool.query(
      `
      UPDATE shop_users
      SET pos_pin_attempts     = 0,
          pos_pin_locked_until = NULL
      WHERE shop_id   = $1
        AND user_id   = $2
        AND is_active = true
      `,
      [shopId, targetUserId]
    );
    return (result.rowCount ?? 0) > 0;
  }

  // ── Increment token version (force logout) ───────────────
  //
  // FIX: Use COALESCE(pos_token_version, 0) + 1 instead of
  // pos_token_version + 1.
  //
  // In PostgreSQL, NULL + 1 = NULL. If the column was never
  // explicitly set (e.g. rows created before the column was
  // added), the UPDATE silently writes NULL back instead of 1.
  // Force logout appears to succeed (rowCount = 1) but the
  // version never changes, so the revoked token keeps working.
  //
  // COALESCE treats NULL as 0 before adding 1:
  //   NULL → COALESCE(NULL, 0) + 1 = 1  ✓
  //   0    → COALESCE(0, 0)    + 1 = 1  ✓
  //   1    → COALESCE(1, 0)    + 1 = 2  ✓
  static async incrementTokenVersion(
    shopId: string,
    userId: string
  ): Promise<boolean> {
    const result = await pool.query(
      `
      UPDATE shop_users
      SET pos_token_version = COALESCE(pos_token_version, 0) + 1
      WHERE shop_id   = $1
        AND user_id   = $2
        AND is_active = true
      `,
      [shopId, userId]
    );
    return (result.rowCount ?? 0) > 0;
  }

  static async isShopSuspended(shopId: string): Promise<boolean> {
    const { rows } = await pool.query(
      `SELECT is_suspended FROM shops WHERE id = $1`,
      [shopId]
    );
    return rows[0]?.is_suspended ?? false;
  }

    static async getTableStatus(shopId: string) {
    const { rows } = await pool.query(
      `
      SELECT
        t.id                                AS table_id,
        t.table_number,
        t.capacity,
        o.id                                AS order_id,
        o.order_no,
        o.status                            AS order_status,
        o.total_amount,
        o.bill_requested,
        o.bill_requested_at,
        o.created_at                        AS order_started_at
      FROM restaurant_tables t
      LEFT JOIN orders o
        ON  o.table_id = t.id
        AND o.shop_id  = $1
        AND o.status NOT IN ('PAID', 'CANCELLED', 'REFUNDED')
      WHERE t.shop_id   = $1
        AND t.is_active = TRUE
      ORDER BY t.table_number ASC
      `,
      [shopId]
    );

    return rows;
  }

  static async getSessionContext(shopId: string, userId: string) {
    const { rows } = await pool.query(
      `SELECT s.name      AS shop_name,
              s.shop_type,
              u.name      AS user_name
       FROM   shops      s
       JOIN   shop_users su ON su.shop_id  = s.id
       JOIN   users      u  ON u.id        = su.user_id
       WHERE  s.id          = $1
         AND  su.user_id    = $2
         AND  s.is_deleted  = false
         AND  su.is_active  = true`,
      [shopId, userId]
    );
    return rows[0] ?? null;
  }
}