// =========================================================
// shop.service.ts
// Path: backend/src/modules/shop/shop.service.ts
//
// NEW: changeStaffRole() — handles role change with proper
// permission checks and PIN cleanup side effects.
//
// Role change rules:
//   - Only OWNER can change any role (including MANAGER → CHEF)
//   - MANAGER can change CASHIER ↔ CHEF (not MANAGER roles)
//   - OWNER role itself can never be changed via this endpoint
//   - When changing TO CHEF: clear POS PIN (chef can't use POS)
//   - When changing FROM CHEF to CASHIER/MANAGER: clear kitchen PIN
//   - MANAGER cannot promote someone to MANAGER
// =========================================================

import { AuditService }    from "../audit/audit.service.js";
import { ShopRepository }  from "./shop.repository.js";
import { UserRepository }  from "../user/user.repository.js";
import { comparePassword } from "../../utils/password.js";
import { appError }        from "../../utils/appError.js";

const MODE_ROLES = ["OWNER", "MANAGER"] as const;

// Roles that can be assigned by managers or owners
type AssignableRole = "MANAGER" | "CASHIER" | "CHEF";

// Roles that cannot use POS — their POS PIN should be cleared
const NON_POS_ROLES = ["CHEF"] as const;

// Roles that cannot use Kitchen — their kitchen PIN should be cleared
const NON_KITCHEN_ROLES = ["CASHIER"] as const;

export class ShopService {

  static async createShop(params: {
    ownerId: string; name: string;
    shopType: "RETAIL" | "RESTAURANT" | "ONLINE_SHOP";
    currency: "USD" | "SGD" | "THB" | "MMK" | "EUR";
  }) {
    const shop = await ShopRepository.createShop(params);
    await ShopRepository.addUserToShop({
      shop_id: shop.id,
      user_id: params.ownerId,
      role: "OWNER",
    });
    await AuditService.log({
      shopId: shop.id,
      userId: params.ownerId,
      action: "SHOP_CREATED",
      entity: "SHOP",
      entityId: shop.id,
      metadata: { name: shop.name, type: shop.shop_type },
    });
    return shop;
  }

  static async updateShop(params: {
    shopId: string;
    requesterId: string;
    name?: string;
    currency?: string;
  }) {
    const member = await ShopRepository.getUserShopMembership(
      params.shopId,
      params.requesterId
    );
    if (!member || member.role !== "OWNER" || !member.is_active) {
      throw new appError("ONLY_OWNER_CAN_UPDATE_SHOP", 403);
    }
    const updated = await ShopRepository.updateShop(params);
    await AuditService.log({
      shopId: params.shopId,
      userId: params.requesterId,
      action: "SHOP_UPDATED",
      entity: "SHOP",
      entityId: params.shopId,
    });
    return updated;
  }

  static async deleteShop(params: { shopId: string; requesterId: string }) {
    const member = await ShopRepository.getUserShopMembership(
      params.shopId,
      params.requesterId
    );
    if (!member || member.role !== "OWNER" || !member.is_active) {
      throw new appError("ONLY_OWNER_CAN_DELETE_SHOP", 403);
    }
    await ShopRepository.softDeleteShop(params.shopId);
    await AuditService.log({
      shopId: params.shopId,
      userId: params.requesterId,
      action: "SHOP_DELETED",
      entity: "SHOP",
      entityId: params.shopId,
    });
    return { success: true };
  }

  static async addStaff(params: {
    shopId: string;
    requesterId: string;
    staffUserId: string;
    role: AssignableRole;
  }) {
    const actor = await ShopRepository.getUserShopMembership(
      params.shopId,
      params.requesterId
    );
    if (!actor || !actor.is_active || !["OWNER", "MANAGER"].includes(actor.role)) {
      throw new appError("NOT_AUTHORIZED", 403);
    }

    // MANAGERs cannot assign the MANAGER role — only OWNERs can
    if (actor.role === "MANAGER" && params.role === "MANAGER") {
      throw new appError("FORBIDDEN", 403);
    }

    const existing = await ShopRepository.getUserShopMembership(
      params.shopId,
      params.staffUserId
    );

    if (!existing) {
      await ShopRepository.addUserToShop({
        shop_id: params.shopId,
        user_id: params.staffUserId,
        role: params.role,
      });
      await AuditService.log({
        shopId: params.shopId,
        userId: params.requesterId,
        action: "STAFF_ADDED",
        entity: "SHOP_USER",
        entityId: params.staffUserId,
        metadata: { role: params.role },
      });
      return { action: "added" };
    }

    if (!existing.is_active) {
      await ShopRepository.activateShopUser(
        params.shopId,
        params.staffUserId,
        params.role
      );
      await AuditService.log({
        shopId: params.shopId,
        userId: params.requesterId,
        action: "STAFF_REACTIVATED",
        entity: "SHOP_USER",
        entityId: params.staffUserId,
        metadata: { role: params.role },
      });
      return { action: "reactivated" };
    }

    throw new appError("USER_ALREADY_ACTIVE", 400);
  }

  static async getStaff(shopId: string, requesterId: string) {
    const actor = await ShopRepository.getUserShopMembership(
      shopId,
      requesterId
    );
    if (
      !actor ||
      !actor.is_active ||
      !["OWNER", "MANAGER"].includes(actor.role)
    ) {
      throw new appError("PERMISSION_DENIED", 403);
    }
    return ShopRepository.getShopStaff(shopId);
  }

  static async removeStaffFromShop(
    shopId: string,
    targetUserId: string,
    actorUserId: string
  ) {
    const actor = await ShopRepository.getUserShopMembership(
      shopId,
      actorUserId
    );
    if (
      !actor ||
      !actor.is_active ||
      !["OWNER", "MANAGER"].includes(actor.role)
    ) {
      throw new appError("PERMISSION_DENIED", 403);
    }
    if (actor.role !== "OWNER") {
      const target = await ShopRepository.getUserShopMembership(
        shopId,
        targetUserId
      );
      if (target?.role === "OWNER") throw new appError("OWNER_CANNOT_BE_REMOVED", 403);
    }
    await ShopRepository.deactivateShopUser(shopId, targetUserId);
    await AuditService.log({
      shopId,
      userId: actorUserId,
      action: "STAFF_REMOVED",
      entity: "SHOP_USER",
      entityId: targetUserId,
    });
    return { success: true };
  }

  // ── NEW: Change a staff member's role ─────────────────────
  // Permission model:
  //   OWNER can change any non-OWNER role to any role
  //   MANAGER can only change CASHIER ↔ CHEF (cannot grant MANAGER)
  //   Nobody can change OWNER's role via this endpoint
  //
  // Side effects:
  //   Changing TO CHEF → clear POS PIN (chef can't use POS)
  //   Changing FROM CHEF to non-CHEF → clear kitchen PIN
  //   This prevents stale PINs from being usable after role change
  static async changeStaffRole(params: {
    shopId:       string;
    requesterId:  string;
    targetUserId: string;
    newRole:      AssignableRole;
  }) {
    // Can't change your own role
    if (params.requesterId === params.targetUserId) {
      throw new appError("CANNOT_MODIFY_SELF_ROLE", 400);
    }

    const actor = await ShopRepository.getUserShopMembership(
      params.shopId,
      params.requesterId
    );
    if (!actor || !actor.is_active || !["OWNER", "MANAGER"].includes(actor.role)) {
      throw new appError("FORBIDDEN", 403);
    }

    const target = await ShopRepository.getUserShopMembership(
      params.shopId,
      params.targetUserId
    );
    if (!target || !target.is_active) {
      throw new appError("STAFF_NOT_FOUND", 404);
    }

    // Cannot change the OWNER's role
    if (target.role === "OWNER") {
      throw new appError("CANNOT_MODIFY_OWNER_ROLE", 403);
    }

    // MANAGER cannot grant or change to MANAGER role
    if (actor.role === "MANAGER" && params.newRole === "MANAGER") {
      throw new appError("FORBIDDEN", 403);
    }

    // MANAGER cannot demote another MANAGER
    if (actor.role === "MANAGER" && target.role === "MANAGER") {
      throw new appError("FORBIDDEN", 403);
    }

    // No-op: role is already the target role
    if (target.role === params.newRole) {
      return { success: true, changed: false };
    }

    const previousRole = target.role;
    const changed = await ShopRepository.changeStaffRole(
      params.shopId,
      params.targetUserId,
      params.newRole
    );
    if (!changed) throw new appError("STAFF_NOT_FOUND", 404);

    // ── Side effect: clean up stale PINs ─────────────────
    // If the new role cannot use POS, clear their POS PIN.
    // This prevents the old PIN from being usable in the wrong mode.
    if (NON_POS_ROLES.includes(params.newRole as any)) {
      await ShopRepository.clearPosPinForUser(params.shopId, params.targetUserId);
    }

    // If the new role cannot use Kitchen, clear their kitchen PIN.
    if (NON_KITCHEN_ROLES.includes(params.newRole as any)) {
      await ShopRepository.clearKitchenPinForUser(params.shopId, params.targetUserId);
    }

    await AuditService.log({
      shopId:   params.shopId,
      userId:   params.requesterId,
      action:   "STAFF_ROLE_CHANGED",
      entity:   "SHOP_USER",
      entityId: params.targetUserId,
      metadata: { previousRole, newRole: params.newRole },
    });

    return { success: true, changed: true };
  }

  static async verifyUserPassword(params: {
    shopId:   string;
    userId:   string;
    password: string;
  }) {
    const member = await ShopRepository.getUserShopMembership(
      params.shopId,
      params.userId
    );
    if (!member || !member.is_active || !MODE_ROLES.includes(member.role)) {
      throw new appError("FORBIDDEN", 403);
    }

    const user = await UserRepository.findById(params.userId);
    if (!user) throw new appError("USER_NOT_FOUND", 404);

    const isValid = await comparePassword(params.password, user.password_hash);

    if (!isValid) {
      await AuditService.log({
        shopId:   params.shopId,
        userId:   params.userId,
        action:   "MODE_GATE_PASSWORD_FAILED",
        entity:   "SHOP",
        entityId: params.shopId,
        metadata: { role: member.role },
      });
      throw new appError("INVALID_PASSWORD", 401);
    }

    await AuditService.log({
      shopId:   params.shopId,
      userId:   params.userId,
      action:   "MODE_GATE_PASSWORD_VERIFIED",
      entity:   "SHOP",
      entityId: params.shopId,
      metadata: { role: member.role },
    });

    return { valid: true };
  }

  static async inviteStaffByEmail(params: {
    shopId:      string;
    requesterId: string;
    email:       string;
    role:        AssignableRole;
  }) {
    const actor = await ShopRepository.getUserShopMembership(
      params.shopId,
      params.requesterId
    );
    if (
      !actor ||
      !actor.is_active ||
      !["OWNER", "MANAGER"].includes(actor.role)
    ) {
      throw new appError("NOT_AUTHORIZED", 403);
    }

    const targetUser = await UserRepository.findByEmail(params.email);
    if (!targetUser) throw new appError("USER_NOT_FOUND", 404);
    if (targetUser.is_deleted) throw new appError("USER_NOT_FOUND", 404);

    return ShopService.addStaff({
      shopId:      params.shopId,
      requesterId: params.requesterId,
      staffUserId: targetUser.id,
      role:        params.role,
    });
  }
}