import { pool } from "../../db/pool.js";
import { Shop } from "./shop.types.js";

export interface CreateShopInput {
  ownerId: string;
  name: string;
  shopType: "RETAIL" | "RESTAURANT";
  currency: "USD" | "SGD" | "THB" | "MMK" | "EUR";
}

export class ShopRepository {
  static async createShop(input: CreateShopInput): Promise<Shop> {
    const { ownerId, name, shopType, currency } = input;

    const result = await pool.query<Shop>(
      `
      INSERT INTO shops (owner_id, name, shop_type, currency)
      VALUES ($1, $2, $3, $4)
      RETURNING *
      `,
      [ownerId, name, shopType, currency]
    );

    return result.rows[0];
  }

  static async updateShop(params: {
    shopId: string;
    name?: string;
    currency?: string;
  }) {
    const result = await pool.query(
      `
      UPDATE shops
      SET
        name = COALESCE($2, name),
        currency = COALESCE($3, currency),
        updated_at = now()
      WHERE id = $1
        AND is_deleted = false
      RETURNING *
      `,
      [params.shopId, params.name ?? null, params.currency ?? null]
    );

    return result.rows[0] ?? null;
  }

  static async findByOwnerId(ownerId: string): Promise<Shop[]> {
    const result = await pool.query<Shop>(
      `
      SELECT *
      FROM shops
      WHERE owner_id = $1
        AND is_deleted = false
      ORDER BY created_at DESC
      `,
      [ownerId]
    );

    return result.rows;
  }

  static async addUserToShop(params: {
    shop_id: string;
    user_id: string;
    role: "OWNER" | "MANAGER" | "CASHIER";
  }) {
    await pool.query(
      `
      INSERT INTO shop_users (shop_id, user_id, role)
      VALUES ($1, $2, $3)
      `,
      [params.shop_id, params.user_id, params.role]
    );
  }

  static async getUserShopMembership(
    shopId: string,
    userId: string
  ) {
    const result = await pool.query(
      `
      SELECT su.role, su.is_active
      FROM shop_users su
      JOIN shops s ON s.id = su.shop_id
      WHERE su.shop_id = $1
        AND su.user_id = $2
        AND s.is_deleted = false
      `,
      [shopId, userId]
    );

    return result.rows[0] ?? null;
  }

  static async getShopStaff(shopId: string) {
    const result = await pool.query(
      `
      SELECT 
        u.id,
        u.name,
        u.email,
        su.role
      FROM shop_users su
      JOIN users u ON u.id = su.user_id
      JOIN shops s ON s.id = su.shop_id
      WHERE su.shop_id = $1
        AND su.is_active = true
        AND s.is_deleted = false
      ORDER BY u.name ASC
      `,
      [shopId]
    );

    return result.rows;
  }

  static async deactivateShopUser(shopId: string, userId: string) {
    const result = await pool.query(
      `
      UPDATE shop_users
      SET is_active = false
      WHERE shop_id = $1
        AND user_id = $2
        AND is_active = true
      `,
      [shopId, userId]
    );

    return result.rowCount;
  }

  static async activateShopUser(
    shopId: string,
    userId: string,
    role: "MANAGER" | "CASHIER"
  ) {
    const result = await pool.query(
      `
      UPDATE shop_users
      SET is_active = true,
          role = $3
      WHERE shop_id = $1
        AND user_id = $2
        AND is_active = false
      `,
      [shopId, userId, role]
    );

    return result.rowCount;
  }

  static async softDeleteShop(shopId: string) {
    const result = await pool.query(
      `
      UPDATE shops
      SET is_deleted = true,
          updated_at = now()
      WHERE id = $1
        AND is_deleted = false
      `,
      [shopId]
    );

    return result.rowCount === 1;
  }

// static async findAllForUser(userId: string) {
//   const result = await pool.query(
//     `
//     SELECT
//       s.*,
//       su.role AS shop_role
//     FROM shop_users su
//     JOIN shops s ON s.id = su.shop_id
//     WHERE su.user_id = $1
//       AND su.is_active = true
//       AND s.is_deleted = false
//     ORDER BY s.created_at DESC
//     `,
//     [userId]
//   );

//   return result.rows;
// }
}