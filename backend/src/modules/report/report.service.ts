// =========================================================
// report.service.ts
// Path: backend/src/modules/report/report.service.ts
// =========================================================
// Business logic for reports.
//
// Responsibilities:
//   1. Verify shop membership (OWNER / MANAGER only)
//   2. Apply default date range if not provided
//   3. Validate from <= to
//   4. Delegate to ReportRepository
//
// Why OWNER / MANAGER only?
//   Revenue and inventory data is commercially sensitive.
//   Cashiers need to process sales, not read P&L reports.
// =========================================================

import { ShopRepository } from "../shop/shop.repository.js";
import { ReportRepository } from "./report.repository.js";
import { DateRangeFilter } from "./report.types.js";
import { appError } from "../../utils/appError.js";

const REPORT_ROLES = ["OWNER", "MANAGER"] as const;

// ── Permission helper ─────────────────────────────────────
async function assertCanViewReports(shopId: string, userId: string) {
  const member = await ShopRepository.getUserShopMembership(shopId, userId);

  if (!member || !member.is_active || !REPORT_ROLES.includes(member.role)) {
    throw new appError("FORBIDDEN", 403);
  }
}

// ── Default date range helper ─────────────────────────────
// Returns today and 30 days ago as ISO date strings.
// We operate in UTC throughout — timezone conversion is a
// frontend concern (the shop's timezone is stored on the
// shops table for future use).
function resolveDateRange(from?: string, to?: string): { from: string; to: string } {
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10); // "YYYY-MM-DD"

  const thirtyDaysAgo = new Date(today);
  thirtyDaysAgo.setDate(today.getDate() - 29); // 29 days back = 30-day window
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

  // Prevent absurdly large ranges that would scan the whole table
  const diffDays = (toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24);
  if (diffDays > 366) {
    throw new appError("DATE_RANGE_TOO_LARGE", 400);
  }
}

export class ReportService {

  // =======================================================
  // SALES SUMMARY
  // =======================================================

  static async getSalesSummary(filter: DateRangeFilter, requesterId: string) {
    await assertCanViewReports(filter.shopId, requesterId);

    const { from, to } = resolveDateRange(filter.from, filter.to);
    validateDateRange(from, to);

    return ReportRepository.getSalesSummary(filter.shopId, from, to);
  }

  // =======================================================
  // SALES BY PRODUCT
  // =======================================================

  static async getSalesByProduct(
    filter: DateRangeFilter & { limit?: number },
    requesterId: string
  ) {
    await assertCanViewReports(filter.shopId, requesterId);

    const { from, to } = resolveDateRange(filter.from, filter.to);
    validateDateRange(from, to);

    // Cap at 100 rows — enough for any dashboard. Prevents
    // accidentally dumping thousands of rows in one request.
    const limit = Math.min(filter.limit ?? 20, 100);

    return ReportRepository.getSalesByProduct(filter.shopId, from, to, limit);
  }

  // =======================================================
  // SALES BY ORDER TYPE
  // =======================================================

  static async getSalesByOrderType(filter: DateRangeFilter, requesterId: string) {
    await assertCanViewReports(filter.shopId, requesterId);

    const { from, to } = resolveDateRange(filter.from, filter.to);
    validateDateRange(from, to);

    return ReportRepository.getSalesByOrderType(filter.shopId, from, to);
  }

  // =======================================================
  // INVENTORY SUMMARY
  // =======================================================

  static async getInventorySummary(filter: DateRangeFilter, requesterId: string) {
    await assertCanViewReports(filter.shopId, requesterId);

    const { from, to } = resolveDateRange(filter.from, filter.to);
    validateDateRange(from, to);

    return ReportRepository.getInventorySummary(filter.shopId, from, to);
  }

  // =======================================================
  // REFUND SUMMARY
  // =======================================================

  static async getRefundSummary(filter: DateRangeFilter, requesterId: string) {
    await assertCanViewReports(filter.shopId, requesterId);

    const { from, to } = resolveDateRange(filter.from, filter.to);
    validateDateRange(from, to);

    return ReportRepository.getRefundSummary(filter.shopId, from, to);
  }
}