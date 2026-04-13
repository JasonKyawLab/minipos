// =========================================================
// pos-auth.service.ts
// Path: src/modules/pos-auth/pos-auth.service.ts
// =========================================================
// Business logic for POS PIN authentication.
//
// Fixes:
//   1. loginWithPin() now accepts deviceId (was silently undefined)
//   2. loginWithPin() reads pos_token_version and embeds it in JWT
//   3. Failed attempt audit log uses correct column names:
//      pos_pin_attempts / pos_pin_locked_until (not pin_attempts)
//   4. getStaffList() uses top-level pool import instead of
//      dynamic import() — cleaner and consistent with the rest
//   5. forceLogoutStaff() re-uses assertOwnerOrManager() helper
//      instead of duplicating the role check inline
// =========================================================

import jwt             from "jsonwebtoken";
import bcrypt          from "bcrypt";
import { pool }        from "../../db/pool.js";
import { PosAuthRepository }  from "./pos-auth.repository.js";
import { ShopRepository }     from "../shop/shop.repository.js";
import { AuditService }       from "../audit/audit.service.js";
import { DeviceModeService }  from "../device-mode/device-mode.service.js";
import { appError }           from "../../utils/appError.js";
import { env }                from "../../config/validation.js";
import { PosJwtPayload }      from "./pos-auth.types.js";

// ── Constants ─────────────────────────────────────────────

const PIN_SALT_ROUNDS = 10;

// PIN lock duration in minutes — communicated to the client
// so the UI can show a countdown.
export const PIN_LOCK_MINUTES = 15;

// ── Permission helpers ────────────────────────────────────
// Both helpers are used in multiple methods, so they live at
// the top of the file rather than being inlined each time.

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

// ── PIN format validation ─────────────────────────────────

function validatePinFormat(pin: string): void {
  if (!/^\d{4,6}$/.test(pin)) {
    throw new appError("PIN_INVALID_FORMAT", 400);
  }
}

// =========================================================
// SERVICE
// =========================================================

export class PosAuthService {

  // ── GET staff list ───────────────────────────────────────
  // Public within the shop — no role restriction.
  // The tablet login screen needs this before any PIN is entered.
  static async getStaffList(shopId: string) {
    const { rows } = await pool.query(
      `SELECT id FROM shops WHERE id = $1 AND is_deleted = false`,
      [shopId]
    );
    if (rows.length === 0) throw new appError("SHOP_NOT_FOUND", 404);

    return PosAuthRepository.getStaffList(shopId);
  }

  // ── Set own PIN ──────────────────────────────────────────
  // Any active shop member can set their own PIN.
  // Requires platform access_token (they must be logged in).
  static async setPin(params: {
    shopId:      string;
    requesterId: string;
    pin:         string;
  }) {
    await assertShopMember(params.shopId, params.requesterId);
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

  // ── Remove own PIN ───────────────────────────────────────
  static async removePin(params: {
    shopId:      string;
    requesterId: string;
  }) {
    await assertShopMember(params.shopId, params.requesterId);

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

  // ── PIN login ────────────────────────────────────────────
  // No platform token required — the tablet is unauthenticated.
  // Staff taps their name, enters PIN, gets back pos_token cookie.
  //
  // FIX 1: added deviceId? so staff sessions are actually recorded.
  // FIX 2: reads pos_token_version from DB and embeds it in JWT
  //        so requirePosAuth middleware can verify it and make
  //        force-logout effective.
  // FIX 3: failed attempt metadata now uses the correct DB column
  //        names (pos_pin_attempts, pos_pin_locked_until).
  static async loginWithPin(params: {
    shopId:    string;
    userId:    string;
    pin:       string;
    deviceId?: string; // FIX 1 — optional: present when called from a device
  }) {
    const membership = await PosAuthRepository.getMembership(
      params.shopId,
      params.userId
    );

    if (!membership || !membership.is_active) {
      throw new appError("INVALID_CREDENTIALS", 401);
    }

    if (!membership.pos_pin_hash) {
      throw new appError("PIN_NOT_SET", 401);
    }

    // Time-based lockout — auto-expires, no manual reset required
    if (
      membership.pos_pin_locked_until &&
      new Date(membership.pos_pin_locked_until) > new Date()
    ) {
      throw new appError("PIN_LOCKED", 423); // 423 Locked is semantically correct
    }

    const maxAttempts = await PosAuthRepository.getShopPinMaxAttempts(params.shopId);

    const isValid = await bcrypt.compare(params.pin, membership.pos_pin_hash);

    if (!isValid) {
      await PosAuthRepository.recordFailedAttempt(
        params.shopId,
        params.userId,
        maxAttempts
      );

      // Re-read so we have the updated attempt count for the error metadata
      const fresh = await PosAuthRepository.getMembership(
        params.shopId,
        params.userId
      );

      // FIX 3 — correct column names: pos_pin_attempts, pos_pin_locked_until
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
          attempts:    fresh?.pos_pin_attempts,    // FIX 3
          maxAttempts,
          locked:      fresh?.pos_pin_locked_until != null, // FIX 3
        },
      });

      if (remaining === 0) {
        throw new appError("PIN_LOCKED", 423);
      }

      throw new appError("INVALID_CREDENTIALS", 401);
    }

    // Success — reset the failed attempt counter
    await PosAuthRepository.resetAttempts(params.shopId, params.userId);

    // FIX 1 — record staff session only when a deviceId was provided.
    // Non-fatal: PIN login succeeds even if device session recording fails.
    if (params.deviceId) {
      try {
        await DeviceModeService.recordStaffLogin({
          shopId:   params.shopId,
          deviceId: params.deviceId,
          userId:   params.userId,
          mode:     "POS",
        });
      } catch (err) {
        console.error("POS staff session record failed (non-fatal):", err);
      }
    }

    // FIX 2 — read current token version so it can be embedded in the JWT.
    // requirePosAuth middleware will compare this against the DB on every
    // request, making force-logout effective immediately.
    const { rows: versionRows } = await pool.query(
      `SELECT pos_token_version
       FROM shop_users
       WHERE shop_id = $1 AND user_id = $2`,
      [params.shopId, params.userId]
    );
    const tokenVersion: number = versionRows[0]?.pos_token_version ?? 0;

    const payload: PosJwtPayload = {
      userId:       params.userId,
      shopId:       params.shopId,
      shopRole:     membership.role as "OWNER" | "MANAGER" | "CASHIER",
      type:         "POS",
      tokenVersion, // FIX 2
    };

    // Short-lived: 8 hours = one shift
    const token = jwt.sign(payload, env.JWT_SECRET, { expiresIn: "8h" });

    await AuditService.log({
      shopId: params.shopId,
      userId: params.userId,
      action: "POS_PIN_LOGIN_SUCCESS",
      entity: "SHOP_USER",
      metadata: { role: membership.role },
    });

    return { token, role: membership.role };
  }

  // ── Force logout a staff member ──────────────────────────
  // Increments pos_token_version in the DB.
  // requirePosAuth will reject the old JWT on the next request.
  // Only OWNER or MANAGER can do this.
  static async forceLogoutStaff(params: {
    shopId:       string;
    requesterId:  string;
    targetUserId: string;
  }) {
    // FIX 5 — use the shared helper instead of duplicating the role check
    await assertOwnerOrManager(params.shopId, params.requesterId);

    const target = await PosAuthRepository.getMembership(
      params.shopId,
      params.targetUserId
    );
    if (!target || !target.is_active) {
      throw new appError("STAFF_NOT_FOUND", 404);
    }

    const updated = await PosAuthRepository.incrementTokenVersion(
      params.shopId,
      params.targetUserId
    );
    if (!updated) throw new appError("STAFF_NOT_FOUND", 404);

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
  // Clears pos_pin_attempts and pos_pin_locked_until WITHOUT
  // removing the PIN itself. Used mid-shift when a cashier is
  // locked out and can't wait 15 minutes.
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
  // OWNER only — this is a shop-level security setting.
  // Validation is done here AND in the Zod schema (defence in depth).
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
}