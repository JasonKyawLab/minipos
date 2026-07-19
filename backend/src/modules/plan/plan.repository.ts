import { db } from "../../db/queries.js";

export interface PlanLimits {
  plan: string;
  max_shops: number;
  max_products: number;
  max_staff: number;
  max_tables: number;
  order_history_days: number;
}

export class PlanRepository {
  static async getLimits(plan: string): Promise<PlanLimits | null> {
    const { rows } = await db.query(
      "SELECT * FROM plan_limits WHERE plan = $1",
      [plan]
    );
    return rows[0] ?? null;
  }

  static async getAllLimits(): Promise<PlanLimits[]> {
    const { rows } = await db.query("SELECT * FROM plan_limits ORDER BY plan");
    return rows;
  }

  static async updateLimits(plan: string, limits: Partial<Omit<PlanLimits, "plan">>): Promise<PlanLimits> {
    const fields = Object.keys(limits);
    const values = Object.values(limits);
    const set = fields.map((f, i) => `${f} = $${i + 2}`).join(", ");
    const { rows } = await db.query(
      `UPDATE plan_limits SET ${set}, updated_at = now() WHERE plan = $1 RETURNING *`,
      [plan, ...values]
    );
    return rows[0];
  }

  static async getUserPlan(userId: string): Promise<string> {
    const { rows } = await db.query(
      "SELECT plan FROM users WHERE id = $1",
      [userId]
    );
    return rows[0]?.plan ?? "free";
  }

  static async setUserPlan(userId: string, plan: string): Promise<void> {
    await db.query(
      "UPDATE users SET plan = $1, updated_at = now() WHERE id = $2",
      [plan, userId]
    );
  }

  static async countUserShops(userId: string): Promise<number> {
    const { rows } = await db.query(
      "SELECT COUNT(*) FROM shops WHERE owner_id = $1 AND is_deleted = false",
      [userId]
    );
    return parseInt(rows[0].count, 10);
  }

  static async countShopProducts(shopId: string): Promise<number> {
    const { rows } = await db.query(
      "SELECT COUNT(*) FROM product_models WHERE shop_id = $1 AND is_deleted = false",
      [shopId]
    );
    return parseInt(rows[0].count, 10);
  }

  static async countShopStaff(shopId: string): Promise<number> {
    const { rows } = await db.query(
      "SELECT COUNT(*) FROM shop_users WHERE shop_id = $1 AND is_active = true AND role != 'OWNER'",
      [shopId]
    );
    return parseInt(rows[0].count, 10);
  }

  static async countShopTables(shopId: string): Promise<number> {
    const { rows } = await db.query(
      "SELECT COUNT(*) FROM restaurant_tables WHERE shop_id = $1 AND is_active = true",
      [shopId]
    );
    return parseInt(rows[0].count, 10);
  }
}
