import jwt     from "jsonwebtoken";
import bcrypt  from "bcrypt";
import { KitchenAuthRepository } from "./kitchen-auth.repository.js";
import { ShopRepository }        from "../shop/shop.repository.js";
import { AuditService }          from "../audit/audit.service.js";
import { appError }              from "../../utils/appError.js";
import { env }                   from "../../config/validation.js";
import { pool }                  from "../../db/pool.js";
import { DeviceModeRepository } from "../device-mode/device-mode.repository.js";
import { emitToShop, emitToKitchenTerminals } from '../socket/socket.js';
import { SOCKET_EVENTS } from '../socket/socket.events.js';


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

static async loginWithPin(params: {
  shopId:      string;
  userId:      string;
  pin:         string;
  terminalId?: string; // value from terminal_id HttpOnly cookie
}) {
  const membership = await KitchenAuthRepository.getMembership(
    params.shopId,
    params.userId
  );

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

  const maxAttempts = await KitchenAuthRepository.getShopPinMaxAttempts(
    params.shopId
  );
  const isValid = await bcrypt.compare(params.pin, membership.kitchen_pin_hash);

  if (!isValid) {
    await KitchenAuthRepository.recordFailedAttempt(
      params.shopId,
      params.userId,
      maxAttempts
    );
    const fresh = await KitchenAuthRepository.getMembership(
      params.shopId,
      params.userId
    );
    const remaining = Math.max(
      0,
      maxAttempts - (fresh?.kitchen_pin_attempts ?? maxAttempts)
    );

    await AuditService.log({
      shopId:   params.shopId,
      userId:   params.userId,
      action:   "KITCHEN_PIN_FAILED",
      entity:   "SHOP_USER",
      metadata: {
        attempts:    fresh?.kitchen_pin_attempts,
        maxAttempts,
        locked:      remaining === 0,
      },
    });

    if (remaining === 0) throw new appError("PIN_LOCKED", 423);
    throw new appError("INVALID_CREDENTIALS", 401);
  }

  await KitchenAuthRepository.resetAttempts(params.shopId, params.userId);

  // ── Resolve physical device from hardware passport cookie ──
  // The terminal_id cookie was set during mode activation and
  // survives staff logouts. It has zero permissions on its own —
  // it is only used here to annotate the work log entry.
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

  // ── Record the shift with a real device_id ─────────────────
  // If deviceId is null (terminal_id cookie was missing or the
  // device was revoked), the shift is still recorded — just
  // without a device reference. This prevents login failures
  // due to a missing hardware passport.
  try {
    await DeviceModeRepository.recordStaffLogin({
      shopId:   params.shopId,
      deviceId: deviceId, // null-safe — column is now nullable
      userId:   params.userId,
      mode:     "KITCHEN",
    });
  } catch (shiftErr) {
    // Non-fatal: shift recording failure must never block login.
    // The chef still needs to access the kitchen display.
    console.error("Kitchen shift recording failed (non-fatal):", shiftErr);
  }

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
    shopId:   params.shopId,
    userId:   params.userId,
    action:   "KITCHEN_PIN_LOGIN_SUCCESS",
    entity:   "SHOP_USER",
    metadata: {
      role:     kitchenRole,
      deviceId: deviceId ?? "unknown",
    },
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

  static async setStaffPin(params: {
    shopId:       string;
    requesterId:  string;
    targetUserId: string;
    pin:          string;
  }) {
    // Requester must be OWNER or MANAGER
    const actor = await assertOwnerOrManager(params.shopId, params.requesterId);

    // Fetch target membership
    const target = await KitchenAuthRepository.getMembership(
      params.shopId,
      params.targetUserId
    );

    // getMembership returns null for CASHIER (blocked at query level)
    if (!target || !target.is_active) {
      throw new appError("STAFF_NOT_FOUND", 404);
    }

    // MANAGER cannot set PIN for OWNER or another MANAGER
    if (actor.role === "MANAGER" && ["OWNER", "MANAGER"].includes(target.role)) {
      throw new appError("FORBIDDEN", 403);
    }

    if (!/^\d{4,6}$/.test(params.pin)) {
      throw new appError("PIN_INVALID_FORMAT", 400);
    }

    const pinHash = await bcrypt.hash(params.pin, PIN_SALT_ROUNDS);
    const updated = await KitchenAuthRepository.setPin(
      params.shopId,
      params.targetUserId,
      pinHash
    );
    if (!updated) throw new appError("SHOP_MEMBER_NOT_FOUND", 404);

    await AuditService.log({
      shopId:   params.shopId,
      userId:   params.requesterId,
      action:   "KITCHEN_PIN_SET_BY_MANAGER",
      entity:   "SHOP_USER",
      entityId: params.targetUserId,
      metadata: { setBy: params.requesterId },
    });

    return { success: true };
  }

    static async removeStaffPin(params: {
    shopId:       string;
    requesterId:  string;
    targetUserId: string;
  }) {
    const actor = await assertOwnerOrManager(params.shopId, params.requesterId);

    const target = await KitchenAuthRepository.getMembership(
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

    const updated = await KitchenAuthRepository.removePin(
      params.shopId,
      params.targetUserId
    );
    if (!updated) throw new appError("SHOP_MEMBER_NOT_FOUND", 404);

    await AuditService.log({
      shopId:   params.shopId,
      userId:   params.requesterId,
      action:   "KITCHEN_PIN_REMOVED_BY_MANAGER",
      entity:   "SHOP_USER",
      entityId: params.targetUserId,
    });

    return { success: true };
  }

static async forceLogoutStaff(params: {
  shopId: string;
  requesterId: string;
  targetUserId: string;
}) {
  const requester = await KitchenAuthRepository.getMembership(params.shopId, params.requesterId);
  if (!requester || !requester.is_active || !["OWNER", "MANAGER"].includes(requester.role)) {
    throw new appError("FORBIDDEN", 403);
  }

  const target = await KitchenAuthRepository.getMembership(params.shopId, params.targetUserId);
  if (!target || !target.is_active) {
    throw new appError("STAFF_NOT_FOUND", 404);
  }

  // Increment token version — invalidates all active kitchen tokens for this user.
  // requireKitchenAuth middleware checks version on every request, so the next
  // API call from the kitchen terminal will return 401 and redirect to PIN screen.
  const updated = await KitchenAuthRepository.incrementKitchenTokenVersion(
    params.shopId,
    params.targetUserId
  );
  if (!updated) throw new appError("STAFF_NOT_FOUND", 404);

  try {
    // 1. Notify the owner's dashboard (shop room) — optional UX feedback
    //    so the dashboard can update the staff list indicator.
    emitToShop(params.shopId, SOCKET_EVENTS.KITCHEN_FORCE_LOGOUT, {
      targetUserId: params.targetUserId,
      timestamp:    new Date().toISOString(),
    });

    // 2. Notify the kitchen terminal itself — this is the critical one.
    //    The terminal joined room terminal:<shopId>:KITCHEN automatically
    //    when its terminal_session cookie was validated during socket connect.
    //    Receiving this event triggers an immediate redirect to the PIN screen
    //    WITHOUT waiting for the next API call to fail with 401.
    emitToKitchenTerminals(params.shopId, SOCKET_EVENTS.KITCHEN_FORCE_LOGOUT, {
      targetUserId: params.targetUserId,
      timestamp:    new Date().toISOString(),
    });
  } catch (socketErr) {
    // Non-fatal: the token version increment already happened.
    // The kitchen terminal will be kicked on its next API call (401).
    // Socket is best-effort.
    console.error("Socket emit for kitchen force logout failed:", socketErr);
  }

  await AuditService.log({
    shopId:   params.shopId,
    userId:   params.requesterId,
    action:   "KITCHEN_FORCE_LOGOUT",
    entity:   "SHOP_USER",
    entityId: params.targetUserId,
    metadata: { targetRole: target.role },
  });

  return { success: true };
}
}