import jwt             from "jsonwebtoken";
import bcrypt          from "bcrypt";
import { pool }        from "../../db/pool.js";
import { PosAuthRepository }    from "./pos-auth.repository.js";
import { AuditService }         from "../audit/audit.service.js";
import { DeviceModeRepository } from "../device-mode/device-mode.repository.js";
import { appError }             from "../../utils/appError.js";
import { assertShopMember, assertShopRole } from "../../utils/authorize.js";
import { WRITE_ROLES }          from "../../constants/roles.constants.js";
import { env }                  from "../../config/validation.js";
import { PosJwtPayload }        from "./pos-auth.types.js";
import { emitToShop, emitToPosTerminals } from "../socket/socket.js";
import { SOCKET_EVENTS }        from "../socket/socket.events.js";

const PIN_SALT_ROUNDS = 10;
export const PIN_LOCK_MINUTES = 15;

// POS-eligible roles — matches the repository filter
const POS_ELIGIBLE_ROLES = ["OWNER", "MANAGER", "CASHIER"] as const;

function validatePinFormat(pin: string): void {
  if (!/^\d{4,6}$/.test(pin)) {
    throw new appError("PIN_INVALID_FORMAT", 400);
  }
}

export class PosAuthService {

  static async getStaffList(shopId: string) {
    const { rows } = await pool.query(
      `SELECT id FROM shops WHERE id = $1 AND is_deleted = false`,
      [shopId]
    );
    if (rows.length === 0) throw new appError("SHOP_NOT_FOUND", 404);

    return PosAuthRepository.getStaffList(shopId);
  }

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

  static async setStaffPin(params: {
    shopId:       string;
    requesterId:  string;
    targetUserId: string;
    pin:          string;
  }) {
    await assertShopRole(params.shopId, params.requesterId, WRITE_ROLES);

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

  static async removeStaffPin(params: {
    shopId:       string;
    requesterId:  string;
    targetUserId: string;
  }) {
    await assertShopRole(params.shopId, params.requesterId, WRITE_ROLES);

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

  static async loginWithPin(params: {
    shopId:     string;
    userId:     string;
    pin:        string;
    terminalId?: string;
  }) {
    if (await PosAuthRepository.isShopSuspended(params.shopId)) {
      throw new appError("SHOP_SUSPENDED", 403);
    }

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

    return {
      token,
      role:     membership.role      as string,
      shopType: membership.shop_type as string,
      shopName: membership.shop_name as string,
      userName: membership.user_name as string,
    };
  }

  static async forceLogoutStaff(params: {
    shopId:       string;
    requesterId:  string;
    targetUserId: string;
  }) {
    await assertShopRole(params.shopId, params.requesterId, WRITE_ROLES);

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

    try {
      emitToShop(params.shopId, SOCKET_EVENTS.POS_FORCE_LOGOUT, {
        targetUserId: params.targetUserId,
        timestamp:    new Date().toISOString(),
      });

      emitToPosTerminals(params.shopId, SOCKET_EVENTS.POS_FORCE_LOGOUT, {
        targetUserId: params.targetUserId,
        timestamp:    new Date().toISOString(),
      });
    } catch (socketErr) {
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

  static async resetStaffLock(params: {
    shopId:       string;
    requesterId:  string;
    targetUserId: string;
  }) {
    await assertShopRole(params.shopId, params.requesterId, WRITE_ROLES);

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

  static async updatePinMaxAttempts(params: {
    shopId:      string;
    requesterId: string;
    maxAttempts: number;
  }) {
    await assertShopRole(params.shopId, params.requesterId, ["OWNER"]);

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
  static async getTableStatus(shopId: string) {
    return PosAuthRepository.getTableStatus(shopId);
  }
}