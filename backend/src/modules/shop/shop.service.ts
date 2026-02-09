import { ShopRepository } from "./shop.repository.js";
import { pool } from "../../db/pool.js";

export class ShopService {
  /**
   * Create a new shop
   * - Owner is auto-added as OWNER
   */
static async createShop(params: {
  ownerId: string;
  name: string;
  shopType: "RETAIL" | "RESTAURANT";
  currency: "USD" | "SGD" | "THB" | "MMK" | "EUR";
}) {
  const { ownerId, name, shopType, currency } = params;

  if (!name || !shopType || !currency) {
    throw new Error("Missing required shop fields");
  }

  const shop = await ShopRepository.createShop({
    ownerId,
    name,
    shopType,
    currency,
  });

  try {
    await ShopRepository.addUserToShop({
      shop_id: shop.id,
      user_id: ownerId,
      role: "OWNER",
    });
  } catch (err) {
    // cleanup to avoid orphan shop
    await ShopRepository.softDeleteShop(shop.id);
    throw err;
  }

  return shop;
}

  /**
   * Update shop (OWNER only)
   */
  static async updateShop(params: {
    shopId: string;
    requesterId: string;
    name?: string;
    currency?: "USD" | "SGD" | "THB" | "MMK" | "EUR";
  }) {
    const { shopId, requesterId, name, currency } = params;

    if (!name && !currency) {
      throw new Error("Nothing to update");
    }

    const requester = await ShopRepository.getUserShopMembership(
      shopId,
      requesterId
    );

    if (!requester || requester.role !== "OWNER" || !requester.is_active) {
      throw new Error("Only owner can update shop");
    }

    const updated = await ShopRepository.updateShop({
      shopId,
      name,
      currency,
    });

    if (!updated) {
      throw new Error("Shop not found or deleted");
    }

    return updated;
  }

  /**
   * Get shops owned by user
   */
  static async getMyShops(userId: string) {
    return ShopRepository.findByOwnerId(userId);
  }

  /**
   * Add staff (OWNER / MANAGER)
   * - Reactivates staff if previously removed
   */
  static async addStaff(params: {
    shopId: string;
    requesterId: string;
    staffUserId: string;
    role: "MANAGER" | "CASHIER";
  }) {
    const { shopId, requesterId, staffUserId, role } = params;

    const requester = await ShopRepository.getUserShopMembership(
      shopId,
      requesterId
    );

    if (
      !requester ||
      !requester.is_active ||
      !["OWNER", "MANAGER"].includes(requester.role)
    ) {
      throw new Error("Not authorized to add staff");
    }

    if (requester.role === "MANAGER" && role === "MANAGER") {
  throw new Error("Manager cannot add another manager");
}

    const staff = await ShopRepository.getUserShopMembership(
      shopId,
      staffUserId
    );

    if (!staff) {
      await ShopRepository.addUserToShop({
        shop_id: shopId,
        user_id: staffUserId,
        role,
      });

      return { success: true, action: "added" };
    }

    if (!staff.is_active) {
      await ShopRepository.activateShopUser(
        shopId,
        staffUserId,
        role
      );

      return { success: true, action: "reactivated" };
    }

    throw new Error("User is already an active staff member");
  }

  /**
   * Get staff list (OWNER / MANAGER)
   */
  static async getStaff(shopId: string, requesterId: string) {
    const requester = await ShopRepository.getUserShopMembership(
      shopId,
      requesterId
    );

    if (
      !requester ||
      !requester.is_active ||
      !["OWNER", "MANAGER"].includes(requester.role)
    ) {
      throw new Error("Permission denied");
    }

    return ShopRepository.getShopStaff(shopId);
  }

  /**
   * Remove staff (soft remove)
   */
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
      throw new Error("Only owner or manager can remove staff");
    }

    if (actorUserId === targetUserId) {
  throw new Error("You cannot remove yourself");
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

    const affected = await ShopRepository.deactivateShopUser(
      shopId,
      targetUserId
    );

    if (affected === 0) {
      throw new Error("Staff not found or already inactive");
    }

    return { success: true };
  }

  /**
   * Soft delete shop (OWNER only)
   */
  static async deleteShop(params: {
    shopId: string;
    requesterId: string;
  }) {
    const { shopId, requesterId } = params;

    const requester = await ShopRepository.getUserShopMembership(
      shopId,
      requesterId
    );

    if (!requester || requester.role !== "OWNER" || !requester.is_active) {
      throw new Error("Only owner can delete shop");
    }

    const deleted = await ShopRepository.softDeleteShop(shopId);

    if (!deleted) {
      throw new Error("Shop not found");
    }

    return { success: true };
  }
}