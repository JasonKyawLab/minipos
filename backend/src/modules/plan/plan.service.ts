import { PlanRepository } from "./plan.repository.js";
import { appError }       from "../../utils/appError.js";

export class PlanService {
  static async checkShopLimit(userId: string): Promise<void> {
    const plan   = await PlanRepository.getUserPlan(userId);
    const limits = await PlanRepository.getLimits(plan);
    if (!limits) return;

    const count = await PlanRepository.countUserShops(userId);
    if (count >= limits.max_shops) {
      throw new appError("PLAN_SHOP_LIMIT_REACHED", 403, {
        plan, used: count, max: limits.max_shops,
      });
    }
  }

  static async checkProductLimit(shopId: string, ownerId: string): Promise<void> {
    const plan   = await PlanRepository.getUserPlan(ownerId);
    const limits = await PlanRepository.getLimits(plan);
    if (!limits) return;

    const count = await PlanRepository.countShopProducts(shopId);
    if (count >= limits.max_products) {
      throw new appError("PLAN_PRODUCT_LIMIT_REACHED", 403, {
        plan, used: count, max: limits.max_products,
      });
    }
  }

  static async checkStaffLimit(shopId: string, ownerId: string): Promise<void> {
    const plan   = await PlanRepository.getUserPlan(ownerId);
    const limits = await PlanRepository.getLimits(plan);
    if (!limits) return;

    const count = await PlanRepository.countShopStaff(shopId);
    if (count >= limits.max_staff) {
      throw new appError("PLAN_STAFF_LIMIT_REACHED", 403, {
        plan, used: count, max: limits.max_staff,
      });
    }
  }

  static async checkTableLimit(shopId: string, ownerId: string): Promise<void> {
    const plan   = await PlanRepository.getUserPlan(ownerId);
    const limits = await PlanRepository.getLimits(plan);
    if (!limits) return;

    const count = await PlanRepository.countShopTables(shopId);
    if (count >= limits.max_tables) {
      throw new appError("PLAN_TABLE_LIMIT_REACHED", 403, {
        plan, used: count, max: limits.max_tables,
      });
    }
  }

  static async getUserUsage(userId: string, shopId?: string) {
    const plan      = await PlanRepository.getUserPlan(userId);
    const limits    = await PlanRepository.getLimits(plan);
    const shopCount = await PlanRepository.countUserShops(userId);

    const usage: Record<string, any> = {
      plan,
      limits,
      shops: { used: shopCount, max: limits?.max_shops ?? 0 },
    };

    if (shopId) {
      const [products, staff, tables] = await Promise.all([
        PlanRepository.countShopProducts(shopId),
        PlanRepository.countShopStaff(shopId),
        PlanRepository.countShopTables(shopId),
      ]);
      usage.products = { used: products, max: limits?.max_products ?? 0 };
      usage.staff    = { used: staff,    max: limits?.max_staff    ?? 0 };
      usage.tables   = { used: tables,   max: limits?.max_tables   ?? 0 };
    }

    return usage;
  }
}
