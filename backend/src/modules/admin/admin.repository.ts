import { db } from "../../db/queries.js";

export class AdminRepository {

  /* ============================
     USERS
  ============================ */

static async findAllUsers() {
    const { rows } = await db.query(`
     SELECT
       u.id, u.name, u.email, u.role, u.status, u.plan, u.is_deleted, u.created_at, u.last_seen_at,
       COUNT(su.shop_id) FILTER (WHERE su.role = 'OWNER' AND s.is_deleted = false) AS shop_count
     FROM users u
     LEFT JOIN shop_users su ON su.user_id = u.id
     LEFT JOIN shops s ON s.id = su.shop_id
     GROUP BY u.id
     ORDER BY u.created_at DESC
    `);

   return rows.map((r: any) => ({ ...r, shop_count: parseInt(r.shop_count, 10) }));
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
      SELECT s.id, s.name, s.shop_type, s.currency,
             s.is_deleted, s.is_suspended, s.suspended_reason, s.suspended_at,
             s.created_at,
             u.id as owner_id, u.name as owner_name, u.email as owner_email
      FROM shops s
      LEFT JOIN shop_users su ON su.shop_id = s.id AND su.role = 'OWNER'
      LEFT JOIN users u ON u.id = su.user_id
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

  static async suspendShop(shopId: string, reason: string) {
    const result = await db.query(
      `UPDATE shops
       SET is_suspended = true,
           suspended_reason = $2,
           suspended_at = now()
       WHERE id = $1 AND is_deleted = false`,
      [shopId, reason]
    );
    return (result.rowCount ?? 0) > 0;
  }

  static async unsuspendShop(shopId: string) {
    const result = await db.query(
      `UPDATE shops
       SET is_suspended = false,
           suspended_reason = NULL,
           suspended_at = NULL
       WHERE id = $1`,
      [shopId]
    );
    return (result.rowCount ?? 0) > 0;
  }

  static async suspendUser(userId: string): Promise<boolean> {
    const result = await db.query(
      `UPDATE users SET status = 'SUSPENDED' WHERE id = $1 AND is_deleted = false`,
      [userId]
    );
    return (result.rowCount ?? 0) > 0;
  }

  static async reactivateUser(userId: string): Promise<boolean> {
    const result = await db.query(
      `UPDATE users SET status = 'ACTIVE' WHERE id = $1`,
      [userId]
    );
    return (result.rowCount ?? 0) > 0;
  }

  static async getStats() {
    // Single round-trip for the headline counts — each is cheap
    // (COUNT on small tables), and bundling them avoids 5 separate
    // network round-trips for numbers that are all shown together.
    const { rows: [counts] } = await db.query(`
      SELECT
        (SELECT COUNT(*) FROM users WHERE is_deleted = false)                          AS total_users,
        (SELECT COUNT(*) FROM users WHERE is_deleted = false AND status = 'SUSPENDED') AS suspended_users,
        (SELECT COUNT(*) FROM users WHERE is_deleted = false AND role = 'ADMIN')       AS admin_count,
        (SELECT COUNT(*) FROM shops WHERE is_deleted = false)                          AS total_shops,
        (SELECT COUNT(*) FROM shops WHERE is_deleted = false AND is_suspended = true)  AS suspended_shops
    `);

    // Signups per day, last 30 days. generate_series fills in days
    // with zero signups — without it, a quiet day just wouldn't
    // appear in the result, and the chart would show wrong gaps
    // instead of an actual zero.
    const { rows: signupsByDay } = await db.query(`
      SELECT
        d.day::date AS date,
        COUNT(u.id) AS count
      FROM generate_series(
        CURRENT_DATE - INTERVAL '29 days',
        CURRENT_DATE,
        INTERVAL '1 day'
      ) AS d(day)
      LEFT JOIN users u
        ON u.created_at::date = d.day AND u.is_deleted = false
      GROUP BY d.day
      ORDER BY d.day ASC
    `);

    // Shop status breakdown for a pie/bar chart.
    const { rows: [shopBreakdown] } = await db.query(`
      SELECT
        COUNT(*) FILTER (WHERE is_deleted = false AND is_suspended = false) AS active,
        COUNT(*) FILTER (WHERE is_deleted = false AND is_suspended = true)  AS suspended,
        COUNT(*) FILTER (WHERE is_deleted = true)                          AS deleted
      FROM shops
    `);

    return {
      totals: {
        total_users:      parseInt(counts.total_users, 10),
        suspended_users:  parseInt(counts.suspended_users, 10),
        admin_count:       parseInt(counts.admin_count, 10),
        total_shops:      parseInt(counts.total_shops, 10),
        suspended_shops:  parseInt(counts.suspended_shops, 10),
      },
      signupsByDay: signupsByDay.map((r: any) => ({
        date: r.date,
        count: parseInt(r.count, 10),
      })),
      shopBreakdown: {
        active:    parseInt(shopBreakdown.active, 10),
        suspended: parseInt(shopBreakdown.suspended, 10),
        deleted:   parseInt(shopBreakdown.deleted, 10),
      },
    };
  }

}