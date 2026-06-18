// =========================================================
// pos-auth.service.ts
// Path: backend/src/modules/pos-auth/pos-auth.service.ts
//
// CHANGE: loginWithPin() now fetches shop_type, shop name,
// and user name alongside the existing membership query so
// the controller can return them to the POS terminal.
// The terminal stores them in PosContext to drive the
// order-type selector (RETAIL / DINE_IN / TAKEAWAY).
//
// ADDITION: getTableStatus() — returns all active tables
// joined with their live order status for the POS floor view.
// =========================================================

import jwt             from "jsonwebtoken";
import bcrypt          from "bcrypt";
import { pool }        from "../../db/pool.js";
import { PosAuthRepository }    from "./pos-auth.repository.js";
import { ShopRepository }       from "../shop/shop.repository.js";
import { AuditService }         from "../audit/audit.service.js";
import { DeviceModeRepository } from "../device-mode/device-mode.repository.js";
import { appError }             from "../../utils/appError.js";
import { env }                  from "../../config/validation.js";
import { PosJwtPayload }        from "./pos-auth.types.js";
import { emitToShop, emitToPosTerminals } from "../socket/socket.js";
import { SOCKET_EVENTS }        from "../socket/socket.events.js";

const PIN_SALT_ROUNDS = 10;
export const PIN_LOCK_MINUTES = 15;

// POS-eligible roles — matches the repository filter
const POS_ELIGIBLE_ROLES = ["OWNER", "MANAGER", "CASHIER"] as const;

async function assertShopMember(shopId: string, userId: string) {
  const member = await ShopRepository.getUserShopMembership(shopId, userId);
  if (!member || !member.is_active) {
    throw new appError("FORBIDDEN", 403);
  }
  return member;
}

async function assertOwnerOrManager(shopId: string, userId: string) {
  const member = await assertShopMember(shopId, userId);
  if (!["OWNER", "MANAGER"].includes(member.role)) {
    throw new appError("FORBIDDEN", 403);
  }
  return member;
}

function validatePinFormat(pin: string): void {
  if (!/^\d{4,6}$/.test(pin)) {
    throw new appError("PIN_INVALID_FORMAT", 400);
  }
}

export class PosAuthService {

  // ── GET staff list ───────────────────────────────────────
  // Returns only POS-eligible staff (OWNER, MANAGER, CASHIER).
  // CHEF is filtered out at the repository level.
  static async getStaffList(shopId: string) {
    const { rows } = await pool.query(
      `SELECT id FROM shops WHERE id = $1 AND is_deleted = false`,
      [shopId]
    );
    if (rows.length === 0) throw new appError("SHOP_NOT_FOUND", 404);

    return PosAuthRepository.getStaffList(shopId);
  }

  // ── Set own PIN ──────────────────────────────────────────
  // Any active POS-eligible shop member sets their own PIN.
  // Requires platform access_token (logged in as themselves).
  static async setPin(params: {
    shopId:      string;
    requesterId: string;
    pin:         string;
  }) {
    const member = await assertShopMember(params.shopId, params.requesterId);

    // CHEF cannot have a POS PIN — they use Kitchen Mode only
    if (!POS_ELIGIBLE_ROLES.includes(member.role as any)) {
      throw new appError("FORBIDDEN", 403);
    }

    validatePinFormat(params.pin);

    const pinHash = await bcrypt.hash(params.pin, PIN_SALT_ROUNDS);
    const updated = await PosAuthRepository.setPin(
      params.shopId,
      params.requesterId,
      pinHash
    );
    if (!updated) throw new appError("SHOP_MEMBER_NOT_FOUND", 404);

    await AuditService.log({
      shopId:   params.shopId,
      userId:   params.requesterId,
      action:   "POS_PIN_SET",
      entity:   "SHOP_USER",
      entityId: params.requesterId,
    });

    return { success: true };
  }

  // ── Set another staff member's PIN ──────────────────────
  // Only OWNER or MANAGER can set another member's PIN.
  // The target must be a POS-eligible role (not CHEF).
  static async setStaffPin(params: {
    shopId:       string;
    requesterId:  string;
    targetUserId: string;
    pin:          string;
  }) {
    await assertOwnerOrManager(params.shopId, params.requesterId);

    const target = await PosAuthRepository.getMembership(
      params.shopId,
      params.targetUserId
    );
    if (!target || !target.is_active) {
      throw new appError("SHOP_MEMBER_NOT_FOUND", 404);
    }
    if (!POS_ELIGIBLE_ROLES.includes(target.role as any)) {
      throw new appError("FORBIDDEN", 403);
    }

    validatePinFormat(params.pin);

    const pinHash = await bcrypt.hash(params.pin, PIN_SALT_ROUNDS);
    const updated = await PosAuthRepository.setPin(
      params.shopId,
      params.targetUserId,
      pinHash
    );
    if (!updated) throw new appError("SHOP_MEMBER_NOT_FOUND", 404);

    await AuditService.log({
      shopId:   params.shopId,
      userId:   params.requesterId,
      action:   "POS_PIN_SET_BY_MANAGER",
      entity:   "SHOP_USER",
      entityId: params.targetUserId,
      metadata: { setBy: params.requesterId },
    });

    return { success: true };
  }

  // ── Remove own PIN ───────────────────────────────────────
  static async removePin(params: {
    shopId:      string;
    requesterId: string;
  }) {
    const updated = await PosAuthRepository.removePin(
      params.shopId,
      params.requesterId
    );
    if (!updated) throw new appError("SHOP_MEMBER_NOT_FOUND", 404);

    await AuditService.log({
      shopId:   params.shopId,
      userId:   params.requesterId,
      action:   "POS_PIN_REMOVED",
      entity:   "SHOP_USER",
      entityId: params.requesterId,
    });

    return { success: true };
  }

  // ── Remove another staff member's PIN ───────────────────
  static async removeStaffPin(params: {
    shopId:       string;
    requesterId:  string;
    targetUserId: string;
  }) {
    await assertOwnerOrManager(params.shopId, params.requesterId);

    const updated = await PosAuthRepository.removePin(
      params.shopId,
      params.targetUserId
    );
    if (!updated) throw new appError("SHOP_MEMBER_NOT_FOUND", 404);

    await AuditService.log({
      shopId:   params.shopId,
      userId:   params.requesterId,
      action:   "POS_PIN_REMOVED_BY_MANAGER",
      entity:   "SHOP_USER",
      entityId: params.targetUserId,
      metadata: { removedBy: params.requesterId },
    });

    return { success: true };
  }

  // ── PIN login ────────────────────────────────────────────
  //
  // CHANGE: Now returns shopType, shopName, and userName in
  // addition to token and role.
  //
  // WHY: The POS terminal page needs shop_type to know which
  // order types to offer (RETAIL → only "RETAIL"; RESTAURANT
  // → "DINE_IN" / "TAKEAWAY"). ShopContext is not available
  // in the POS layout (it's a separate layout with no
  // platform auth), so this data must travel through the
  // login response and be stored in PosContext.
  //
  // HOW: We extend the existing membership+shop query to also
  // join shops and users — one single DB round trip, no extra
  // queries added.
  static async loginWithPin(params: {
    shopId:     string;
    userId:     string;
    pin:        string;
    terminalId?: string;
  }) {
    // ── Fetch membership + shop info + user name in one query ──
    //
    // WHY one query: we need membership fields (role, pin_hash,
    // lockout, token_version), shop fields (shop_type, name),
    // and user name. Joining them here avoids 2 extra round trips.
    const { rows: memberRows } = await pool.query(
      `
      SELECT
        su.role,
        su.is_active,
        su.pos_pin_hash,
        su.pos_pin_attempts,
        su.pos_pin_locked_until,
        su.pos_token_version,
        s.name       AS shop_name,
        s.shop_type,
        u.name       AS user_name
      FROM shop_users su
      JOIN shops s ON s.id = su.shop_id
      JOIN users u ON u.id = su.user_id
      WHERE su.shop_id    = $1
        AND su.user_id    = $2
        AND s.is_deleted  = false
        AND u.is_deleted  = false
      `,
      [params.shopId, params.userId]
    );
    const membership = memberRows[0] ?? null;

    if (!membership || !membership.is_active) {
      throw new appError("INVALID_CREDENTIALS", 401);
    }

    // CHEF cannot log into POS mode
    if (!POS_ELIGIBLE_ROLES.includes(membership.role as any)) {
      throw new appError("FORBIDDEN", 403);
    }

    if (!membership.pos_pin_hash) {
      throw new appError("PIN_NOT_SET", 401);
    }

    if (
      membership.pos_pin_locked_until &&
      new Date(membership.pos_pin_locked_until) > new Date()
    ) {
      throw new appError("PIN_LOCKED", 423);
    }

    const maxAttempts = await PosAuthRepository.getShopPinMaxAttempts(params.shopId);
    const isValid = await bcrypt.compare(params.pin, membership.pos_pin_hash);

    if (!isValid) {
      await PosAuthRepository.recordFailedAttempt(
        params.shopId,
        params.userId,
        maxAttempts
      );

      const fresh = await PosAuthRepository.getMembership(
        params.shopId,
        params.userId
      );

      const remaining = Math.max(
        0,
        maxAttempts - (fresh?.pos_pin_attempts ?? maxAttempts)
      );

      await AuditService.log({
        shopId: params.shopId,
        userId: params.userId,
        action: "POS_PIN_FAILED",
        entity: "SHOP_USER",
        metadata: {
          attempts:    fresh?.pos_pin_attempts,
          maxAttempts,
          locked:      fresh?.pos_pin_locked_until != null,
        },
      });

      if (remaining === 0) {
        throw new appError("PIN_LOCKED", 423);
      }

      throw new appError("INVALID_CREDENTIALS", 401);
    }

    await PosAuthRepository.resetAttempts(params.shopId, params.userId);

    // ── Trace terminal device ─────────────────────────────
    let deviceId: string | null = null;
    if (params.terminalId) {
      const { rows: deviceRows } = await pool.query(
        `
        SELECT id
        FROM shop_devices
        WHERE terminal_token = $1
          AND shop_id        = $2
          AND status         = 'APPROVED'
        `,
        [params.terminalId, params.shopId]
      );
      deviceId = deviceRows[0]?.id ?? null;
    }

    await DeviceModeRepository.recordStaffLogin({
      shopId:   params.shopId,
      deviceId: deviceId,
      userId:   params.userId,
      mode:     "POS",
    });

    // ── Sign JWT ──────────────────────────────────────────
    const tokenVersion: number = membership.pos_token_version ?? 0;

    const payload: PosJwtPayload = {
      userId:       params.userId,
      shopId:       params.shopId,
      shopRole:     membership.role as "OWNER" | "MANAGER" | "CASHIER",
      type:         "POS",
      tokenVersion,
    };

    const token = jwt.sign(payload, env.JWT_SECRET, { expiresIn: "8h" });

    await AuditService.log({
      shopId: params.shopId,
      userId: params.userId,
      action: "POS_PIN_LOGIN_SUCCESS",
      entity: "SHOP_USER",
      metadata: { role: membership.role },
    });

    // ── Return token + session info ───────────────────────
    //
    // shopType, shopName, userName are new.
    // The controller passes them to res.json() so the frontend
    // can populate PosContext without a second API call.
    return {
      token,
      role:     membership.role      as string,
      shopType: membership.shop_type as string,
      shopName: membership.shop_name as string,
      userName: membership.user_name as string,
    };
  }

  // ── Force logout a staff member ──────────────────────────
  static async forceLogoutStaff(params: {
    shopId:       string;
    requesterId:  string;
    targetUserId: string;
  }) {
    await assertOwnerOrManager(params.shopId, params.requesterId);

    const target = await PosAuthRepository.getMembership(
      params.shopId,
      params.targetUserId
    );
    if (!target || !target.is_active) {
      throw new appError("STAFF_NOT_FOUND", 404);
    }

    // Increment token version — invalidates the JWT server-side.
    // Any subsequent API call from the terminal will return 401.
    const updated = await PosAuthRepository.incrementTokenVersion(
      params.shopId,
      params.targetUserId
    );
    if (!updated) throw new appError("STAFF_NOT_FOUND", 404);

    try {
      // Notify dashboard (owner's browser)
      emitToShop(params.shopId, SOCKET_EVENTS.POS_FORCE_LOGOUT, {
        targetUserId: params.targetUserId,
        timestamp:    new Date().toISOString(),
      });

      // Notify the actual POS terminal — triggers immediate redirect
      emitToPosTerminals(params.shopId, SOCKET_EVENTS.POS_FORCE_LOGOUT, {
        targetUserId: params.targetUserId,
        timestamp:    new Date().toISOString(),
      });
    } catch (socketErr) {
      // Non-fatal: token version increment already happened.
      // Terminal will be kicked on its next API call (401).
      console.error("Socket emit for force logout failed:", socketErr);
    }

    await AuditService.log({
      shopId:   params.shopId,
      userId:   params.requesterId,
      action:   "POS_FORCE_LOGOUT",
      entity:   "SHOP_USER",
      entityId: params.targetUserId,
      metadata: { targetRole: target.role },
    });

    return { success: true };
  }

  // ── Reset a locked-out staff member ─────────────────────
  static async resetStaffLock(params: {
    shopId:       string;
    requesterId:  string;
    targetUserId: string;
  }) {
    await assertOwnerOrManager(params.shopId, params.requesterId);

    const reset = await PosAuthRepository.resetStaffLock(
      params.shopId,
      params.targetUserId
    );
    if (!reset) throw new appError("SHOP_MEMBER_NOT_FOUND", 404);

    await AuditService.log({
      shopId:   params.shopId,
      userId:   params.requesterId,
      action:   "POS_PIN_LOCK_RESET",
      entity:   "SHOP_USER",
      entityId: params.targetUserId,
      metadata: { resetBy: params.requesterId },
    });

    return { success: true };
  }

  // ── Update shop pin_max_attempts ─────────────────────────
  static async updatePinMaxAttempts(params: {
    shopId:      string;
    requesterId: string;
    maxAttempts: number;
  }) {
    const member = await assertShopMember(params.shopId, params.requesterId);
    if (member.role !== "OWNER") {
      throw new appError("FORBIDDEN", 403);
    }

    if (params.maxAttempts < 1 || params.maxAttempts > 10) {
      throw new appError("INVALID_PIN_MAX_ATTEMPTS", 400);
    }

    const updated = await PosAuthRepository.updateShopPinMaxAttempts(
      params.shopId,
      params.maxAttempts
    );
    if (!updated) throw new appError("SHOP_NOT_FOUND", 404);

    await AuditService.log({
      shopId:   params.shopId,
      userId:   params.requesterId,
      action:   "POS_PIN_MAX_ATTEMPTS_UPDATED",
      entity:   "SHOP",
      entityId: params.shopId,
      metadata: { maxAttempts: params.maxAttempts },
    });

    return { success: true };
  }

  // ── Get live table status for POS floor view ─────────────
  //
  // Returns every active table for this shop joined with its
  // current "active" order, if one exists.
  //
  // "Active" means any order status that is not a terminal
  // state: PAID, CANCELLED, REFUNDED. An order in OPEN,
  // CONFIRMED, or CLOSING is still in progress.
  //
  // A restaurant table can only have one active order at a
  // time (enforced at order creation in OrderService), so
  // the LEFT JOIN will return at most one order row per table.
  //
  // WHY LEFT JOIN and not INNER JOIN:
  //   INNER JOIN would exclude tables with no active order,
  //   making them invisible in the floor view. The cashier
  //   needs to see all tables — even empty ones — to know
  //   which ones are available for new walk-in customers.
  //
  // The result is ordered by table_number so the floor view
  // renders in a consistent, predictable grid order.
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
}