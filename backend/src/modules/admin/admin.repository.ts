import { db } from "../../db/queries.js";

export class AdminRepository {

  /* ============================
     USERS
  ============================ */

  static async findAllUsers() {
    const { rows } = await db.query(`
      SELECT id, name, email, role, is_deleted, created_at
      FROM users
      ORDER BY created_at DESC
    `);

    return rows;
  }

  static async updateUserRole(userId: string, role: "ADMIN" | "USER") {
    const result = await db.query(
      `UPDATE users SET role = $1 WHERE id = $2`,
      [role, userId]
    );

    return (result.rowCount ?? 0) > 0;
  }

  static async softDeleteUser(userId: string) {
    const result = await db.query(
      `UPDATE users SET is_deleted = true WHERE id = $1`,
      [userId]
    );

    return (result.rowCount ?? 0) > 0;
  }

  static async restoreUser(userId: string) {
    const result = await db.query(
      `UPDATE users SET is_deleted = false WHERE id = $1`,
      [userId]
    );

    return (result.rowCount ?? 0) > 0;
  }

  /* ============================
     SHOPS
  ============================ */

  static async findAllShops() {
    const { rows } = await db.query(`
      SELECT s.id,
             s.name,
             s.shop_type,
             s.currency,
             s.is_deleted,
             s.created_at,
             u.id as owner_id,
             u.name as owner_name,
             u.email as owner_email
      FROM shops s
      LEFT JOIN shop_users su
        ON su.shop_id = s.id
        AND su.role = 'OWNER'
      LEFT JOIN users u
        ON u.id = su.user_id
      ORDER BY s.created_at DESC
    `);

    return rows;
  }

  static async softDeleteShop(shopId: string) {
    const result = await db.query(
      `UPDATE shops SET is_deleted = true WHERE id = $1`,
      [shopId]
    );

    return (result.rowCount ?? 0) > 0;
  }

  static async restoreShop(shopId: string) {
    const result = await db.query(
      `UPDATE shops SET is_deleted = false WHERE id = $1`,
      [shopId]
    );

    return (result.rowCount ?? 0) > 0;
  }

  static async countAdmins(): Promise<number> {
  const { rows } = await db.query(
    `SELECT COUNT(*) FROM users WHERE role = 'ADMIN' AND is_deleted = false`
  );

  return Number(rows[0].count);
}
}