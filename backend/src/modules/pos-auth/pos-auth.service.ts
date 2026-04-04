import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import { PosAuthRepository } from "./pos-auth.repository.js";
import { ShopRepository }    from "../shop/shop.repository.js";
import { AuditService }      from "../audit/audit.service.js";
import { appError }          from "../../utils/appError.js";
import { env }               from "../../config/validation.js";
import { PosJwtPayload }     from "./pos-auth.types.js";

const PIN_SALT_ROUNDS = 10;
// PIN lock duration communicated to the client (for display)
export const PIN_LOCK_MINUTES = 15;

// ── Permission helpers ────────────────────────────────────

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

// ── PIN validation ────────────────────────────────────────

function validatePinFormat(pin: string): void {
  // 4-6 digits only — simple enough to type on a numpad
  if (!/^\d{4,6}$/.test(pin)) {
    throw new appError("PIN_INVALID_FORMAT", 400);
  }
}

export class PosAuthService {

  // ── GET staff list ───────────────────────────────────────
  // Public within the shop — no role restriction.
  // The tablet login screen needs this before any PIN is entered.
  static async getStaffList(shopId: string) {
    // Verify shop exists and is active (soft-delete check)
    const { rows } = await (await import("../../db/pool.js")).pool.query(
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
    shopId:    string;
    requesterId: string;
    pin:       string;
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
  // Staff taps their name, enters PIN, gets back pos_token.
  static async loginWithPin(params: {
    shopId: string;
    userId: string;
    pin:    string;
  }) {
    const membership = await PosAuthRepository.getMembership(
      params.shopId,
      params.userId
    );

    if (!membership || !membership.is_active) {
      throw new appError("INVALID_CREDENTIALS", 401);
    }

    // No PIN set yet
    if (!membership.pin_hash) {
      throw new appError("PIN_NOT_SET", 401);
    }

    // Check lockout (auto-expires, no manual reset needed for time-based)
    if (
      membership.pin_locked_until &&
      new Date(membership.pin_locked_until) > new Date()
    ) {
      throw new appError("PIN_LOCKED", 423);  // 423 Locked is semantically correct
    }

    const maxAttempts = await PosAuthRepository.getShopPinMaxAttempts(params.shopId);

    const isValid = await bcrypt.compare(params.pin, membership.pin_hash);

    if (!isValid) {
      await PosAuthRepository.recordFailedAttempt(
        params.shopId,
        params.userId,
        maxAttempts
      );

      // Re-read to know the current count for the error message
      const fresh = await PosAuthRepository.getMembership(
        params.shopId,
        params.userId
      );

      const remaining = Math.max(0, maxAttempts - (fresh?.pin_attempts ?? maxAttempts));

      await AuditService.log({
        shopId: params.shopId,
        userId: params.userId,
        action: "POS_PIN_FAILED",
        entity: "SHOP_USER",
        metadata: {
          attempts:  fresh?.pin_attempts,
          maxAttempts,
          locked:    fresh?.pin_locked_until != null,
        },
      });

      if (remaining === 0) {
        throw new appError("PIN_LOCKED", 423);
      }

      throw new appError("INVALID_CREDENTIALS", 401);
    }

    // Success — reset counter
    await PosAuthRepository.resetAttempts(params.shopId, params.userId);

    // Issue POS JWT — short-lived (8 hours = one shift)
    const payload: PosJwtPayload = {
      userId:   params.userId,
      shopId:   params.shopId,
      shopRole: membership.role as "OWNER" | "MANAGER" | "CASHIER",
      type:     "POS",
    };

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

  // ── Owner resets a staff lock ────────────────────────────
  // Used when a cashier is locked out mid-shift and can't wait
  // 15 minutes. Owner action — logs who did the reset.
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
      shopId: params.shopId,
      userId: params.requesterId,
      action: "POS_PIN_MAX_ATTEMPTS_UPDATED",
      entity: "SHOP",
      entityId: params.shopId,
      metadata: { maxAttempts: params.maxAttempts },
    });

    return { success: true };
  }
}