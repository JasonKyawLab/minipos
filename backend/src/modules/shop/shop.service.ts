import { AuditService } from "../audit/audit.service.js";
import { ShopRepository } from "./shop.repository.js";
export class ShopService {

  static async createShop(params: {
    ownerId: string;
    name: string;
    shopType: "RETAIL" | "RESTAURANT";
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
    metadata: {
      name: shop.name,
      type: shop.shop_type,
    },
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
      throw new Error("Only owner can update shop");
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

  static async deleteShop(params: {
    shopId: string;
    requesterId: string;
  }) {
    const member = await ShopRepository.getUserShopMembership(
      params.shopId,
      params.requesterId
    );

    if (!member || member.role !== "OWNER" || !member.is_active) {
      throw new Error("Only owner can delete shop");
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
    role: "MANAGER" | "CASHIER";
  }) {
    const actor = await ShopRepository.getUserShopMembership(
      params.shopId,
      params.requesterId
    );

    if (!actor || !actor.is_active || !["OWNER", "MANAGER"].includes(actor.role)) {
      throw new Error("Not authorized");
    }

    const staff = await ShopRepository.getUserShopMembership(
      params.shopId,
      params.staffUserId
    );

    if (!staff) {
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
    metadata: {
      role: params.role,
    },
  });
      return { action: "added" };
    }

    if (!staff.is_active) {
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
    metadata: {
      role: params.role,
    },
  });

      return { action: "reactivated" };
    }

    throw new Error("User already active");
  }

  static async getStaff(shopId: string, requesterId: string) {
    const actor = await ShopRepository.getUserShopMembership(
      shopId,
      requesterId
    );

    if (!actor || !actor.is_active || !["OWNER", "MANAGER"].includes(actor.role)) {
      throw new Error("Permission denied");
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

    if (!actor || !actor.is_active || !["OWNER", "MANAGER"].includes(actor.role)) {
      throw new Error("Permission denied");
    }

    if (actor.role !== "OWNER") {
      const target = await ShopRepository.getUserShopMembership(
        shopId,
        targetUserId
      );

      if (target?.role === "OWNER") {
        throw new Error("Owner cannot be removed");
      }
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
}