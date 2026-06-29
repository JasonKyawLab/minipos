export const SHOP_ROLES = ["OWNER", "MANAGER", "CASHIER", "CHEF"] as const;
export type ShopRole = (typeof SHOP_ROLES)[number];

// Can create/update/delete shop configuration (products, modifiers, tables, etc.)
export const WRITE_ROLES: readonly ShopRole[] = ["OWNER", "MANAGER"];

// Can read shop configuration + operate POS
export const READ_ROLES: readonly ShopRole[] = ["OWNER", "MANAGER", "CASHIER"];

// Any active shop member, regardless of role
export const ALL_ROLES: readonly ShopRole[] = ["OWNER", "MANAGER", "CASHIER", "CHEF"];

// Sensitive operations: refunds, staff PIN management, financial reports
export const SENSITIVE_WRITE_ROLES: readonly ShopRole[] = ["OWNER", "MANAGER"];

// Kitchen Display System access (CASHIER explicitly excluded everywhere)
export const KITCHEN_ROLES: readonly ShopRole[] = ["OWNER", "MANAGER", "CHEF"];
export const KITCHEN_WRITE_ROLES: readonly ShopRole[] = ["OWNER", "MANAGER"];