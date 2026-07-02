import { ShopRepository } from "../modules/shop/shop.repository.js";
import { appError } from "./appError.js";
import { ShopRole } from "../constants/roles.constants.js";

export interface ShopMembership {
  role: ShopRole;
  is_active: boolean;
}

/**
 * Throws FORBIDDEN (403) unless the user is an active shop member
 * whose role is in `allowedRoles`. Returns the membership row so
 * callers that need the role afterward (e.g. to branch behavior)
 * don't have to query again.
 */
export async function assertShopRole(
  shopId: string,
  userId: string,
  allowedRoles: readonly ShopRole[]
): Promise<ShopMembership> {
  const member = await ShopRepository.getUserShopMembership(shopId, userId);

  if (!member || !member.is_active || !allowedRoles.includes(member.role)) {
    throw new appError("FORBIDDEN", 403);
  }

  return member;
}

/**
 * Same as assertShopRole, but for callers that only need to confirm
 * shop membership exists, without checking a role allow-list.
 */
export async function assertShopMember(
  shopId: string,
  userId: string
): Promise<ShopMembership> {
  const member = await ShopRepository.getUserShopMembership(shopId, userId);

  if (!member || !member.is_active) {
    throw new appError("FORBIDDEN", 403);
  }

  return member;
}