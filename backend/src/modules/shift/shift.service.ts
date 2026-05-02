// =========================================================
// src/modules/shift/shift.service.ts
//
// Business logic for the Work Log / Shift Tracking feature.
//
// Access control rules:
//   OWNER / MANAGER → can see ALL staff shifts for their shop
//   CASHIER         → can only see their OWN shifts
//   CHEF            → can only see their OWN shifts
//
// This enforces the product requirement that staff cannot
// see other people's work history.
// =========================================================

import { ShopRepository }  from "../shop/shop.repository.js";
import { ShiftRepository } from "./shift.repository.js";
import { appError }        from "../../utils/appError.js";

// Roles that can view ALL shifts for the shop
const MANAGER_ROLES = ["OWNER", "MANAGER"] as const;

// Roles that can ONLY view their own shifts
const STAFF_ROLES   = ["CASHIER", "CHEF"] as const;

// All roles that are allowed to access the shift tab at all
const ALL_SHIFT_ROLES = [...MANAGER_ROLES, ...STAFF_ROLES] as const;

async function assertShopMember(shopId: string, userId: string) {
  const member = await ShopRepository.getUserShopMembership(shopId, userId);
  if (!member || !member.is_active) {
    throw new appError("FORBIDDEN", 403);
  }
  return member;
}

export class ShiftService {

  // ── List shifts ─────────────────────────────────────────
  // The key logic: managers see all, staff see only themselves.
  static async listShifts(params: {
    shopId:      string;
    requesterId: string;
    from?:       string;
    to?:         string;
    userId?:     string;   // manager can filter by user
    mode?:       "POS" | "KITCHEN";
    limit:       number;
    offset:      number;
  }) {
    const member = await assertShopMember(params.shopId, params.requesterId);

    if (!ALL_SHIFT_ROLES.includes(member.role as typeof ALL_SHIFT_ROLES[number])) {
      throw new appError("FORBIDDEN", 403);
    }

    // Staff roles: always override userId to their own ID.
    // Even if they pass a different userId in the query,
    // we ignore it — they can only see themselves.
    const isStaff = STAFF_ROLES.includes(member.role as typeof STAFF_ROLES[number]);

    if (isStaff) {
      const [shifts, total] = await Promise.all([
        ShiftRepository.findShiftsForUser({
          shopId:  params.shopId,
          userId:  params.requesterId,   // force their own ID
          from:    params.from,
          to:      params.to,
          limit:   params.limit,
          offset:  params.offset,
        }),
        ShiftRepository.countShiftsForShop({
          shopId: params.shopId,
          userId: params.requesterId,    // force their own ID
          from:   params.from,
          to:     params.to,
        }),
      ]);
      return { shifts, total };
    }

    // Manager/Owner: can see all, with optional user filter
    const [shifts, total] = await Promise.all([
      ShiftRepository.findShiftsForShop({
        shopId:  params.shopId,
        from:    params.from,
        to:      params.to,
        userId:  params.userId,
        mode:    params.mode,
        limit:   params.limit,
        offset:  params.offset,
      }),
      ShiftRepository.countShiftsForShop({
        shopId: params.shopId,
        from:   params.from,
        to:     params.to,
        userId: params.userId,
        mode:   params.mode,
      }),
    ]);

    return { shifts, total };
  }

  // ── Get stats for a specific user ───────────────────────
  // Managers can request stats for any user.
  // Staff can only get their own stats.
  static async getStats(params: {
    shopId:      string;
    requesterId: string;
    targetUserId?: string;   // who to get stats for
    from?:       string;
    to?:         string;
  }) {
    const member = await assertShopMember(params.shopId, params.requesterId);

    if (!ALL_SHIFT_ROLES.includes(member.role as typeof ALL_SHIFT_ROLES[number])) {
      throw new appError("FORBIDDEN", 403);
    }

    const isStaff = STAFF_ROLES.includes(member.role as typeof STAFF_ROLES[number]);

    // Determine whose stats to fetch
    // Staff always get their own, managers can specify
    const targetUserId = isStaff
      ? params.requesterId
      : (params.targetUserId ?? params.requesterId);

    return ShiftRepository.getStaffShiftStats({
      shopId: params.shopId,
      userId: targetUserId,
      from:   params.from,
      to:     params.to,
    });
  }

  // ── Get staff list for filter dropdown ──────────────────
  // Only managers can see the full staff list.
  static async getStaffList(shopId: string, requesterId: string) {
    const member = await assertShopMember(shopId, requesterId);

    if (!MANAGER_ROLES.includes(member.role as typeof MANAGER_ROLES[number])) {
      throw new appError("FORBIDDEN", 403);
    }

    return ShiftRepository.getActiveStaffForShop(shopId);
  }
}