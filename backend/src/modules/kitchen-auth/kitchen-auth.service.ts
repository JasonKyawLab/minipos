import jwt     from "jsonwebtoken";
import bcrypt  from "bcrypt";
import { KitchenAuthRepository } from "./kitchen-auth.repository.js";
import { ShopRepository }        from "../shop/shop.repository.js";
import { AuditService }          from "../audit/audit.service.js";
import { appError }              from "../../utils/appError.js";
import { env }                   from "../../config/validation.js";
import { pool }                  from "../../db/pool.js";

const PIN_SALT_ROUNDS = 10;

// OWNER and MANAGER are the only roles allowed in the kitchen.
// CASHIER is excluded — the query in the repository filters them out.
const KITCHEN_WRITE_ROLES = ["OWNER", "MANAGER"] as const;

async function assertKitchenMember(shopId: string, userId: string) {
  const member = await KitchenAuthRepository.getMembership(shopId, userId);
  // getMembership returns null for CASHIER — this is the enforcement point
  if (!member || !member.is_active) {
    throw new appError("FORBIDDEN", 403);
  }
  return member;
}

async function assertOwnerOrManager(shopId: string, userId: string) {
  const member = await assertKitchenMember(shopId, userId);
  if (!KITCHEN_WRITE_ROLES.includes(member.role)) {
    throw new appError("FORBIDDEN", 403);
  }
  return member;
}

export class KitchenAuthService {

  static async getStaffList(shopId: string) {
    const { rows } = await pool.query(
      `SELECT id FROM shops WHERE id = $1 AND is_deleted = false`,
      [shopId]
    );
    if (rows.length === 0) throw new appError("SHOP_NOT_FOUND", 404);

    return KitchenAuthRepository.getKitchenStaffList(shopId);
  }

  static async setPin(params: { shopId: string; requesterId: string; pin: string }) {
    // assertKitchenMember will throw FORBIDDEN if user is a CASHIER
    await assertKitchenMember(params.shopId, params.requesterId);

    if (!/^\d{4,6}$/.test(params.pin)) {
      throw new appError("PIN_INVALID_FORMAT", 400);
    }

    const pinHash = await bcrypt.hash(params.pin, PIN_SALT_ROUNDS);
    const updated = await KitchenAuthRepository.setPin(params.shopId, params.requesterId, pinHash);
    if (!updated) throw new appError("SHOP_MEMBER_NOT_FOUND", 404);

    await AuditService.log({
      shopId: params.shopId, userId: params.requesterId,
      action: "KITCHEN_PIN_SET", entity: "SHOP_USER", entityId: params.requesterId,
    });

    return { success: true };
  }

  static async removePin(params: { shopId: string; requesterId: string }) {
    await assertKitchenMember(params.shopId, params.requesterId);

    const updated = await KitchenAuthRepository.removePin(params.shopId, params.requesterId);
    if (!updated) throw new appError("SHOP_MEMBER_NOT_FOUND", 404);

    await AuditService.log({
      shopId: params.shopId, userId: params.requesterId,
      action: "KITCHEN_PIN_REMOVED", entity: "SHOP_USER", entityId: params.requesterId,
    });

    return { success: true };
  }

  static async loginWithPin(params: { shopId: string; userId: string; pin: string }) {
    const membership = await KitchenAuthRepository.getMembership(params.shopId, params.userId);

    if (!membership || !membership.is_active) {
      throw new appError("INVALID_CREDENTIALS", 401);
    }

    if (!membership.kitchen_pin_hash) {
      throw new appError("PIN_NOT_SET", 401);
    }

    if (
      membership.kitchen_pin_locked_until &&
      new Date(membership.kitchen_pin_locked_until) > new Date()
    ) {
      throw new appError("PIN_LOCKED", 423);
    }

    const maxAttempts = await KitchenAuthRepository.getShopPinMaxAttempts(params.shopId);
    const isValid = await bcrypt.compare(params.pin, membership.kitchen_pin_hash);

    if (!isValid) {
      await KitchenAuthRepository.recordFailedAttempt(params.shopId, params.userId, maxAttempts);
      const fresh = await KitchenAuthRepository.getMembership(params.shopId, params.userId);
      const remaining = Math.max(0, maxAttempts - (fresh?.kitchen_pin_attempts ?? maxAttempts));

      await AuditService.log({
        shopId: params.shopId, userId: params.userId,
        action: "KITCHEN_PIN_FAILED", entity: "SHOP_USER",
        metadata: { attempts: fresh?.kitchen_pin_attempts, maxAttempts, locked: remaining === 0 },
      });

      if (remaining === 0) throw new appError("PIN_LOCKED", 423);
      throw new appError("INVALID_CREDENTIALS", 401);
    }

    await KitchenAuthRepository.resetAttempts(params.shopId, params.userId);

    const kitchenRole = membership.role as "OWNER" | "MANAGER" | "CHEF";

    const tokenVersion = membership.kitchen_token_version;

    const token = jwt.sign(
      {
        userId:   params.userId,
        shopId:   params.shopId,
        shopRole: kitchenRole,   
        type:     "KITCHEN_SESSION",
        version:  tokenVersion,
      },
      env.JWT_SECRET,
      { expiresIn: "12h" }
    );

    await AuditService.log({
      shopId: params.shopId, userId: params.userId,
      action: "KITCHEN_PIN_LOGIN_SUCCESS", entity: "SHOP_USER",
      metadata: { role: kitchenRole },
    });

    return { token, role: kitchenRole };
  }
  static async resetStaffLock(params: { shopId: string; requesterId: string; targetUserId: string }) {
    await assertOwnerOrManager(params.shopId, params.requesterId);

    const reset = await KitchenAuthRepository.resetStaffLock(params.shopId, params.targetUserId);
    if (!reset) throw new appError("SHOP_MEMBER_NOT_FOUND", 404);

    await AuditService.log({
      shopId: params.shopId, userId: params.requesterId,
      action: "KITCHEN_PIN_LOCK_RESET", entity: "SHOP_USER", entityId: params.targetUserId,
    });

    return { success: true };
  }

  static async forceLogoutStaff(params: {
  shopId: string;
  requesterId: string;   // owner/manager doing the action
  targetUserId: string;  // chef (or any kitchen user)
}) {
  // Check requester is OWNER or MANAGER
  const requester = await KitchenAuthRepository.getMembership(params.shopId, params.requesterId);
  if (!requester || !requester.is_active || !["OWNER", "MANAGER"].includes(requester.role)) {
    throw new appError("FORBIDDEN", 403);
  }

  const target = await KitchenAuthRepository.getMembership(params.shopId, params.targetUserId);
  if (!target || !target.is_active) {
    throw new appError("STAFF_NOT_FOUND", 404);
  }

  // Increment token version – invalidates all active kitchen tokens for this user
  const updated = await KitchenAuthRepository.incrementKitchenTokenVersion(
    params.shopId,
    params.targetUserId
  );
  if (!updated) throw new appError("STAFF_NOT_FOUND", 404);

  await AuditService.log({
    shopId: params.shopId,
    userId: params.requesterId,
    action: "KITCHEN_FORCE_LOGOUT",
    entity: "SHOP_USER",
    entityId: params.targetUserId,
    metadata: { targetRole: target.role },
  });

  return { success: true };
}
}