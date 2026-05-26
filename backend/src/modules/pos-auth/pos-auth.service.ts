// =========================================================
// pos-auth.service.ts
// Path: backend/src/modules/pos-auth/pos-auth.service.ts
//
// NEW: setStaffPin() — lets a manager/owner set the POS PIN
// for another staff member. The existing setPin() only sets
// your own PIN (reads requesterId from the JWT). This new
// method lets OWNER/MANAGER set it for any CASHIER/MANAGER.
//
// Why is this needed?
//   New staff members can't set their own PIN because:
//   a) They may not have access to the dashboard (CASHIER)
//   b) They need a manager to do initial onboarding
//   The manager enters the PIN on their behalf in the UI.
// =========================================================

import jwt             from "jsonwebtoken";
import bcrypt          from "bcrypt";
import { pool }        from "../../db/pool.js";
import { PosAuthRepository }  from "./pos-auth.repository.js";
import { ShopRepository }     from "../shop/shop.repository.js";
import { AuditService }       from "../audit/audit.service.js";
import { DeviceModeService }  from "../device-mode/device-mode.service.js";
import { DeviceModeRepository } from '../device-mode/device-mode.repository.js';
import { appError }           from "../../utils/appError.js";
import { env }                from "../../config/validation.js";
import { PosJwtPayload }      from "./pos-auth.types.js";
import { emitToShop, emitToPosTerminals } from '../socket/socket.js';
import { SOCKET_EVENTS } from '../socket/socket.events.js';


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

  // ── NEW: Set another staff member's PIN ──────────────────
  // OWNER or MANAGER sets the POS PIN for a specific staff member.
  // This is the "manager onboarding" flow — the manager enters
  // the PIN on behalf of the new cashier.
  //
  // Permission rules:
  //   - Only OWNER or MANAGER can call this
  //   - MANAGER cannot set the PIN for another MANAGER or OWNER
  //   - The target must be a POS-eligible role (not CHEF)
  static async setStaffPin(params: {
    shopId:       string;
    requesterId:  string;  // the manager doing the action
    targetUserId: string;  // the staff member getting a PIN
    pin:          string;
  }) {
    // Requester must be OWNER or MANAGER
    const actor = await assertOwnerOrManager(params.shopId, params.requesterId);

    // Fetch target membership
    const target = await ShopRepository.getUserShopMembership(
      params.shopId,
      params.targetUserId
    );
    if (!target || !target.is_active) {
      throw new appError("STAFF_NOT_FOUND", 404);
    }

    // Target must be POS-eligible (not CHEF, not OWNER if actor is MANAGER)
    if (!POS_ELIGIBLE_ROLES.includes(target.role as any)) {
      throw new appError("STAFF_NOT_POS_ELIGIBLE", 400);
    }

    // MANAGER cannot set PIN for OWNER or another MANAGER
    if (actor.role === "MANAGER" && ["OWNER", "MANAGER"].includes(target.role)) {
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

  // ── NEW: Remove another staff member's PIN ───────────────
  // OWNER or MANAGER removes a staff member's POS PIN.
  static async removeStaffPin(params: {
    shopId:       string;
    requesterId:  string;
    targetUserId: string;
  }) {
    const actor = await assertOwnerOrManager(params.shopId, params.requesterId);

    const target = await ShopRepository.getUserShopMembership(
      params.shopId,
      params.targetUserId
    );
    if (!target || !target.is_active) {
      throw new appError("STAFF_NOT_FOUND", 404);
    }

    // MANAGER cannot remove PIN for OWNER or another MANAGER
    if (actor.role === "MANAGER" && ["OWNER", "MANAGER"].includes(target.role)) {
      throw new appError("FORBIDDEN", 403);
    }

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
    });

    return { success: true };
  }

  // ── PIN login ────────────────────────────────────────────
  static async loginWithPin(params: {
    shopId:    string;
    userId:    string;
    pin:       string;
    terminalId?: string;
  }) {
    const membership = await PosAuthRepository.getMembershipWithTokenVersion(
      params.shopId,
      params.userId
    );

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

    let deviceId: string | null = null;

    if (params.terminalId) {
      const { rows } = await pool.query(
      `
      SELECT id
      FROM shop_devices
      WHERE terminal_token = $1
        AND shop_id        = $2
        AND status         = 'APPROVED'
      `,
      [params.terminalId, params.shopId]
    );
      deviceId = rows[0]?.id ?? null;
    }

    await DeviceModeRepository.recordStaffLogin({
    shopId:   params.shopId,
    deviceId: deviceId,  // Now properly traced to hardware
    userId:   params.userId,
    mode:     'POS',
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

    return { token, role: membership.role };
  }

  // ── Force logout a staff member ──────────────────────────
  static async forceLogoutStaff(params: {
  shopId:       string;
  requesterId:  string;
  targetUserId: string;
}) {
  await assertOwnerOrManager(params.shopId, params.requesterId);

  const target = await PosAuthRepository.getMembership(params.shopId, params.targetUserId);
  if (!target || !target.is_active) {
    throw new appError("STAFF_NOT_FOUND", 404);
  }

  // Increment token version — this invalidates the JWT server-side.
  // Any subsequent API call from the terminal will return 401.
  const updated = await PosAuthRepository.incrementTokenVersion(
    params.shopId,
    params.targetUserId
  );
  if (!updated) throw new appError("STAFF_NOT_FOUND", 404);

  try {
    // 1. Notify the owner's dashboard (Browser B) — optional UX feedback
    emitToShop(params.shopId, SOCKET_EVENTS.POS_FORCE_LOGOUT, {
      targetUserId: params.targetUserId,
      timestamp:    new Date().toISOString(),
    });

    // 2. Notify the actual POS terminal (Browser A) — this is the fix.
    //    The terminal joined room terminal:<shopId>:POS automatically
    //    on socket connect by presenting its terminal_session cookie.
    //    Receiving this event triggers an immediate redirect to the
    //    PIN login screen without waiting for the next API call to 401.
    emitToPosTerminals(params.shopId, SOCKET_EVENTS.POS_FORCE_LOGOUT, {
      targetUserId: params.targetUserId,
      timestamp:    new Date().toISOString(),
    });
  } catch (socketErr) {
    // Non-fatal: the token version increment already happened.
    // The terminal will be kicked on its next API call (401).
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
}