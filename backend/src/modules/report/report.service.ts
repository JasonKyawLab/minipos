//=========================================================
// Responsibilities:
//   1. Verify shop membership (OWNER / MANAGER only)
//   2. Apply default date range if not provided
//   3. Validate from <= to
//   4. Delegate to ReportRepository
// =========================================================

import { ReportRepository } from "./report.repository.js";
import { DateRangeFilter } from "./report.types.js";
import { appError } from "../../utils/appError.js";
import { assertShopRole } from "../../utils/authorize.js";
import { WRITE_ROLES } from "../../constants/roles.constants.js";

// ── Default date range helper ─────────────────────────────
function resolveDateRange(from?: string, to?: string): { from: string; to: string } {
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);

  const thirtyDaysAgo = new Date(today);
  thirtyDaysAgo.setDate(today.getDate() - 29);
  const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().slice(0, 10);

  return {
    from: from ?? thirtyDaysAgoStr,
    to:   to   ?? todayStr,
  };
}

// ── Date validation helper ────────────────────────────────
function validateDateRange(from: string, to: string) {
  const fromDate = new Date(from);
  const toDate   = new Date(to);

  if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
    throw new appError("INVALID_DATE_FORMAT", 400);
  }

  if (fromDate > toDate) {
    throw new appError("FROM_DATE_AFTER_TO_DATE", 400);
  }

  const diffDays = (toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24);
  if (diffDays > 366) {
    throw new appError("DATE_RANGE_TOO_LARGE", 400);
  }
}

export class ReportService {

  static async getSalesSummary(filter: DateRangeFilter, requesterId: string) {
    await assertShopRole(filter.shopId, requesterId, WRITE_ROLES);

    const { from, to } = resolveDateRange(filter.from, filter.to);
    validateDateRange(from, to);

    return ReportRepository.getSalesSummary(filter.shopId, from, to);
  }

  static async getSalesByProduct(
    filter: DateRangeFilter & { limit?: number },
    requesterId: string
  ) {
    await assertShopRole(filter.shopId, requesterId, WRITE_ROLES);

    const { from, to } = resolveDateRange(filter.from, filter.to);
    validateDateRange(from, to);

    const limit = Math.min(filter.limit ?? 20, 100);

    return ReportRepository.getSalesByProduct(filter.shopId, from, to, limit);
  }

  static async getSalesByOrderType(filter: DateRangeFilter, requesterId: string) {
    await assertShopRole(filter.shopId, requesterId, WRITE_ROLES);

    const { from, to } = resolveDateRange(filter.from, filter.to);
    validateDateRange(from, to);

    return ReportRepository.getSalesByOrderType(filter.shopId, from, to);
  }

  static async getInventorySummary(filter: DateRangeFilter, requesterId: string) {
    await assertShopRole(filter.shopId, requesterId, WRITE_ROLES);

    const { from, to } = resolveDateRange(filter.from, filter.to);
    validateDateRange(from, to);

    return ReportRepository.getInventorySummary(filter.shopId, from, to);
  }

  static async getRefundSummary(filter: DateRangeFilter, requesterId: string) {
    await assertShopRole(filter.shopId, requesterId, WRITE_ROLES);

    const { from, to } = resolveDateRange(filter.from, filter.to);
    validateDateRange(from, to);

    return ReportRepository.getRefundSummary(filter.shopId, from, to);
  }
}