// =========================================================
// shop.service.ts
// Path: backend/src/modules/shop/shop.service.ts
// =========================================================
// CHANGES:
//   - addStaff() now accepts "CHEF" as a valid role
//   - inviteStaffByEmail() now passes CHEF through
//   - verifyUserPassword() role check unchanged (OWNER/MANAGER only)
// =========================================================

import { AuditService }    from "../audit/audit.service.js";
import { ShopRepository }  from "./shop.repository.js";
import { UserRepository }  from "../user/user.repository.js";
import { comparePassword } from "../../utils/password.js";
import { appError }        from "../../utils/appError.js";

// Only OWNER and MANAGER can activate POS/Kitchen modes
const MODE_ROLES = ["OWNER", "MANAGER"] as const;

// Roles that can be assigned to staff members
// CHEF is now a valid assignable role (kitchen-only access)
type AssignableRole = "MANAGER" | "CASHIER" | "CHEF";

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

  // ── Add staff ─────────────────────────────────────────────
  // Accepts MANAGER | CASHIER | CHEF.
  // CHEF role gives kitchen display access only — no POS PIN login.
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

  // ── Mode gate password verification ──────────────────────
  // Only OWNER or MANAGER can unlock POS or Kitchen mode.
  // CASHIER and CHEF cannot be the gatekeeper.
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

  // ── Invite staff by email ─────────────────────────────────
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