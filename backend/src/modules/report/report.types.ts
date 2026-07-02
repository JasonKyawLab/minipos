// All types for the report module.
//
// Design: every report accepts a DateRangeFilter so the
// caller can scope results to any window. The service layer
// defaults to "last 30 days" when from/to are omitted.

// ── Shared filter ─────────────────────────────────────────
export interface DateRangeFilter {
  shopId: string;
  from?: string;   // ISO date string, e.g. "2024-01-01"
  to?: string;     // ISO date string, e.g. "2024-01-31"
}

// ── Sales Summary ─────────────────────────────────────────
// One row — top-level KPIs for the date range.
export interface SalesSummaryReport {
  period_from: string;
  period_to: string;
  total_orders: number;
  paid_orders: number;
  cancelled_orders: number;
  refunded_orders: number;
  gross_revenue: number;       // sum of subtotal (before tax/discount)
  tax_collected: number;       // sum of tax_amount
  discount_given: number;      // sum of discount_amount
  net_revenue: number;         // sum of total_amount on PAID orders
  total_refunded: number;      // sum of refund amounts
  average_order_value: number; // net_revenue / paid_orders
}

// ── Sales by Product ──────────────────────────────────────
// One row per product item — best-sellers report.
export interface SalesByProductRow {
  product_model_id: string;
  product_name: string;
  item_name: string;
  total_qty_sold: number;
  total_revenue: number;       // sum of order_items.subtotal
  order_count: number;         // how many distinct orders included this item
}

// ── Sales by Order Type ───────────────────────────────────
// One row per order_type (RETAIL, DINE_IN, QR, etc.)
export interface SalesByOrderTypeRow {
  order_type: string;
  order_count: number;
  total_revenue: number;
  percentage: number;          // this type's revenue as % of total
}

// ── Inventory Summary ─────────────────────────────────────
// One row per product item — current stock snapshot.
export interface InventorySummaryRow {
  item_id: string;
  product_name: string;
  item_name: string;
  sku: string | null;
  track_stock: boolean;
  stock_qty: number;
  is_low_stock: boolean;       // stock_qty <= low_stock_threshold (default 10)
  is_sold_out: boolean;
  total_sold: number;          // from inventory_movements type=SALE in period
  total_purchased: number;     // from inventory_movements type=PURCHASE in period
}

// ── Refund Summary ────────────────────────────────────────
export interface RefundSummaryReport {
  period_from: string;
  period_to: string;
  total_refund_transactions: number;
  total_amount_refunded: number;
  refund_rate: number;         // refunded_orders / paid_orders * 100
  top_refunded_items: TopRefundedItem[];
}

export interface TopRefundedItem {
  item_name: string;
  product_name: string;
  refund_count: number;
  refund_qty: number;
}

// ── Peak Hours ────────────────────────────────────────────
// One row per hour of the day (0–23) showing order volume.
export interface PeakHourRow {
  hour: number;          // 0–23 in the shop's local timezone
  order_count: number;
  total_revenue: number;
}