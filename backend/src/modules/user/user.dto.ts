import { User } from "./user.model.js";
import { ShopRole } from "./user.types.js";

export interface UserDTO {
  id: string;
  name: string;
  email: string;
  role: "ADMIN" | "USER";
  status: "ACTIVE" | "SUSPENDED";
}

export function toUserDTO(user: User): UserDTO {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    status: user.status,
  };
}

export interface UserShopDTO {
  shopId: string;
  shopName: string;
  shopType: string;
  currency: string;
  timezone: string;
  role: ShopRole;
}

interface UserShopRow {
  id: string;
  name: string;
  shop_type: string;
  currency: string;
  timezone: string | null;
  shop_role: ShopRole;
}

export function toUserShopDTO(row: UserShopRow): UserShopDTO {
  return {
    shopId: row.id,
    shopName: row.name,
    shopType: row.shop_type,
    currency: row.currency,
    timezone: row.timezone ?? "UTC",
    role: row.shop_role,
  };
}