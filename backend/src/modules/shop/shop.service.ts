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

    return ShopRepository.updateShop(params);
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

    return ShopRepository.softDeleteShop(params.shopId);
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
      return { action: "added" };
    }

    if (!staff.is_active) {
      await ShopRepository.activateShopUser(
        params.shopId,
        params.staffUserId,
        params.role
      );
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

    return ShopRepository.deactivateShopUser(shopId, targetUserId);
  }
}