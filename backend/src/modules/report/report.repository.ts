// ALL raw SQL for reports. No business logic here.
//
// Performance notes:
//   - Every query is scoped to shop_id first so PostgreSQL
//     uses the (shop_id, created_at DESC) indexes.
//   - Date range params are cast to TIMESTAMPTZ at query
//     boundaries so the index scan stays tight.
//   - We never JOIN more tables than necessary per query.

import { pool } from "../../db/pool.js";
import {
  SalesSummaryReport,
  SalesByProductRow,
  SalesByOrderTypeRow,
  InventorySummaryRow,
  RefundSummaryReport,
  TopRefundedItem,
  PeakHourRow,
} from "./report.types.js";

export class ReportRepository {

  // =======================================================
  // SALES SUMMARY
  // =======================================================

  /**
   * Returns a single-row KPI summary for the given period.
   *
   * Why one query?
   *   Multiple round-trips for each metric (total orders,
   *   revenue, refunds) would be slower and harder to keep
   *   consistent. A single query with conditional aggregates
   *   (FILTER WHERE) runs in one pass over the indexed rows.
   */
  static async getSalesSummary(
    shopId: string,
    from: string,
    to: string
  ): Promise<SalesSummaryReport> {
    const result = await pool.query(
      `
      WITH order_stats AS (
        SELECT
          COUNT(*)                                             AS total_orders,
          COUNT(*) FILTER (WHERE status = 'PAID')             AS paid_orders,
          COUNT(*) FILTER (WHERE status = 'CANCELLED')        AS cancelled_orders,
          COUNT(*) FILTER (WHERE status = 'REFUNDED')         AS refunded_orders,
          COALESCE(SUM(subtotal)       FILTER (WHERE status = 'PAID'), 0) AS gross_revenue,
          COALESCE(SUM(tax_amount)     FILTER (WHERE status = 'PAID'), 0) AS tax_collected,
          COALESCE(SUM(discount_amount)FILTER (WHERE status = 'PAID'), 0) AS discount_given,
          COALESCE(SUM(total_amount)   FILTER (WHERE status = 'PAID'), 0) AS net_revenue
        FROM orders
        WHERE shop_id   = $1
          AND created_at >= $2::timestamptz
          AND created_at <  $3::timestamptz + INTERVAL '1 day'
      ),
      refund_stats AS (
        SELECT COALESCE(SUM(r.amount), 0) AS total_refunded
        FROM refunds r
        JOIN orders o ON o.id = r.order_id
        WHERE o.shop_id   = $1
          AND r.created_at >= $2::timestamptz
          AND r.created_at <  $3::timestamptz + INTERVAL '1 day'
      )
      SELECT
        os.*,
        rs.total_refunded,
        CASE
          WHEN os.paid_orders > 0
          THEN ROUND(os.net_revenue / os.paid_orders, 2)
          ELSE 0
        END AS average_order_value
      FROM order_stats os, refund_stats rs
      `,
      [shopId, from, to]
    );

    const row = result.rows[0];

    return {
      period_from:           from,
      period_to:             to,
      total_orders:          parseInt(row.total_orders),
      paid_orders:           parseInt(row.paid_orders),
      cancelled_orders:      parseInt(row.cancelled_orders),
      refunded_orders:       parseInt(row.refunded_orders),
      gross_revenue:         parseFloat(row.gross_revenue),
      tax_collected:         parseFloat(row.tax_collected),
      discount_given:        parseFloat(row.discount_given),
      net_revenue:           parseFloat(row.net_revenue),
      total_refunded:        parseFloat(row.total_refunded),
      average_order_value:   parseFloat(row.average_order_value),
    };
  }

  // =======================================================
  // SALES BY PRODUCT
  // =======================================================

  /**
   * Returns one row per product item, ordered by qty sold
   * descending so the best-sellers appear first.
   *
   * We JOIN through product_models → shop_id because
   * order_items stores a snapshot of the name, not a FK to
   * the current product. We use item_name_snapshot for the
   * display name so historical orders (items since deleted)
   * still appear in reports.
   */
  static async getSalesByProduct(
    shopId: string,
    from: string,
    to: string,
    limit: number
  ): Promise<SalesByProductRow[]> {
    const result = await pool.query(
      `
      SELECT
        pm.id                           AS product_model_id,
        oi.product_name_snapshot        AS product_name,
        oi.item_name_snapshot           AS item_name,
        SUM(oi.qty)                     AS total_qty_sold,
        SUM(oi.subtotal)                AS total_revenue,
        COUNT(DISTINCT oi.order_id)     AS order_count
      FROM order_items oi
      JOIN orders o  ON o.id  = oi.order_id
      -- Join product_items and product_models for shop scoping
      -- LEFT JOIN because product_item_id can be NULL (deleted items)
      -- We still want to report on them using the snapshot data
      LEFT JOIN product_items pi  ON pi.id = oi.product_item_id
      LEFT JOIN product_models pm ON pm.id = pi.product_model_id
      WHERE o.shop_id    = $1
        AND o.status     = 'PAID'
        AND oi.status    = 'ACTIVE'
        AND o.created_at >= $2::timestamptz
        AND o.created_at <  $3::timestamptz + INTERVAL '1 day'
      GROUP BY pm.id, oi.product_name_snapshot, oi.item_name_snapshot
      ORDER BY total_qty_sold DESC
      LIMIT $4
      `,
      [shopId, from, to, limit]
    );

    return result.rows.map(row => ({
      product_model_id: row.product_model_id ?? null,
      product_name:     row.product_name,
      item_name:        row.item_name,
      total_qty_sold:   parseInt(row.total_qty_sold),
      total_revenue:    parseFloat(row.total_revenue),
      order_count:      parseInt(row.order_count),
    }));
  }

  // =======================================================
  // SALES BY ORDER TYPE
  // =======================================================

  /**
   * Groups PAID orders by order_type and computes each
   * type's share of total revenue.
   *
   * The percentage is computed in SQL using a window
   * function so we avoid fetching all rows and summing
   * in JavaScript.
   */
  static async getSalesByOrderType(
    shopId: string,
    from: string,
    to: string
  ): Promise<SalesByOrderTypeRow[]> {
    const result = await pool.query(
      `
      SELECT
        order_type,
        COUNT(*)             AS order_count,
        SUM(total_amount)    AS total_revenue,
        ROUND(
          SUM(total_amount) * 100.0
          / NULLIF(SUM(SUM(total_amount)) OVER (), 0),
          2
        )                    AS percentage
      FROM orders
      WHERE shop_id    = $1
        AND status     = 'PAID'
        AND created_at >= $2::timestamptz
        AND created_at <  $3::timestamptz + INTERVAL '1 day'
      GROUP BY order_type
      ORDER BY total_revenue DESC
      `,
      [shopId, from, to]
    );

    return result.rows.map(row => ({
      order_type:    row.order_type,
      order_count:   parseInt(row.order_count),
      total_revenue: parseFloat(row.total_revenue),
      percentage:    parseFloat(row.percentage ?? 0),
    }));
  }

  // =======================================================
  // INVENTORY SUMMARY
  // =======================================================

  /**
   * Returns current stock snapshot for all tracked items,
   * plus movement totals (SALE, PURCHASE) within the period.
   *
   * Why LEFT JOIN inventory_movements?
   *   An item may have had zero sales in the period. We
   *   still want to see it in the report with 0 sold.
   *
   * low_stock_threshold = 10 (hardcoded default).
   * A future enhancement could store this per item.
   */
  static async getInventorySummary(
    shopId: string,
    from: string,
    to: string
  ): Promise<InventorySummaryRow[]> {
    const result = await pool.query(
      `
      SELECT
        pi.id                       AS item_id,
        pm.name                     AS product_name,
        pi.name                     AS item_name,
        pi.sku,
        pi.track_stock,
        pi.stock_qty,
        pi.stock_qty <= 10          AS is_low_stock,
        pi.is_sold_out,

        -- Total sold in the period (negative qty in movements = sold)
        COALESCE(ABS(SUM(im.quantity)
          FILTER (
            WHERE im.type = 'SALE'
              AND im.created_at >= $2::timestamptz
              AND im.created_at < $3::timestamptz + INTERVAL '1 day'
          )
        ), 0)                       AS total_sold,

        -- Total purchased/restocked in the period
        COALESCE(SUM(im.quantity)
          FILTER (
            WHERE im.type = 'PURCHASE'
              AND im.created_at >= $2::timestamptz
              AND im.created_at < $3::timestamptz + INTERVAL '1 day'
          )
        , 0)                        AS total_purchased

      FROM product_items pi
      JOIN product_models pm ON pm.id = pi.product_model_id
      LEFT JOIN inventory_movements im ON im.product_item_id = pi.id
        AND im.shop_id = $1
      WHERE pm.shop_id   = $1
        AND pm.is_deleted = false
        AND pi.track_stock = true
      GROUP BY pi.id, pm.name, pi.name, pi.sku, pi.track_stock,
               pi.stock_qty, pi.is_sold_out
      ORDER BY is_low_stock DESC, pi.stock_qty ASC
      `,
      [shopId, from, to]
    );

    return result.rows.map(row => ({
      item_id:         row.item_id,
      product_name:    row.product_name,
      item_name:       row.item_name,
      sku:             row.sku,
      track_stock:     row.track_stock,
      stock_qty:       parseInt(row.stock_qty),
      is_low_stock:    row.is_low_stock,
      is_sold_out:     row.is_sold_out,
      total_sold:      parseInt(row.total_sold),
      total_purchased: parseInt(row.total_purchased),
    }));
  }

  // =======================================================
  // REFUND SUMMARY
  // =======================================================

  /**
   * Returns aggregate refund metrics plus the top 5 most
   * frequently refunded items.
   *
   * Two queries — keeps each one simple and readable.
   * The overhead of a second round-trip is negligible for
   * a report endpoint that is not on the hot path.
   */
  static async getRefundSummary(
    shopId: string,
    from: string,
    to: string
  ): Promise<RefundSummaryReport> {
    // Query 1: aggregate stats
    const statsResult = await pool.query(
      `
      WITH refund_stats AS (
        SELECT
          COUNT(DISTINCT r.id)     AS total_refund_transactions,
          COALESCE(SUM(r.amount), 0) AS total_amount_refunded
        FROM refunds r
        JOIN orders o ON o.id = r.order_id
        WHERE o.shop_id   = $1
          AND r.created_at >= $2::timestamptz
          AND r.created_at <  $3::timestamptz + INTERVAL '1 day'
      ),
      order_stats AS (
        SELECT
          COUNT(*) FILTER (WHERE status = 'PAID')     AS paid_orders,
          COUNT(*) FILTER (WHERE status = 'REFUNDED') AS refunded_orders
        FROM orders
        WHERE shop_id   = $1
          AND created_at >= $2::timestamptz
          AND created_at <  $3::timestamptz + INTERVAL '1 day'
      )
      SELECT
        rs.total_refund_transactions,
        rs.total_amount_refunded,
        CASE
          WHEN os.paid_orders > 0
          THEN ROUND(os.refunded_orders::numeric * 100 / os.paid_orders, 2)
          ELSE 0
        END AS refund_rate
      FROM refund_stats rs, order_stats os
      `,
      [shopId, from, to]
    );

    // Query 2: top 5 refunded items
    const itemsResult = await pool.query<TopRefundedItem>(
      `
      SELECT
        oi.item_name_snapshot    AS item_name,
        oi.product_name_snapshot AS product_name,
        COUNT(*)                 AS refund_count,
        SUM(oi.refunded_qty)     AS refund_qty
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      WHERE o.shop_id     = $1
        AND oi.status      = 'REFUNDED'
        AND oi.refunded_qty > 0
        AND o.created_at  >= $2::timestamptz
        AND o.created_at  <  $3::timestamptz + INTERVAL '1 day'
      GROUP BY oi.item_name_snapshot, oi.product_name_snapshot
      ORDER BY refund_count DESC
      LIMIT 5
      `,
      [shopId, from, to]
    );

    const stats = statsResult.rows[0];

    return {
      period_from:               from,
      period_to:                 to,
      total_refund_transactions: parseInt(stats.total_refund_transactions),
      total_amount_refunded:     parseFloat(stats.total_amount_refunded),
      refund_rate:               parseFloat(stats.refund_rate),
      top_refunded_items:        itemsResult.rows.map(r => ({
        item_name:    r.item_name,
        product_name: r.product_name,
        refund_count: parseInt(String(r.refund_count)),
        refund_qty:   parseInt(String(r.refund_qty)),
      })),
    };
  }

  // =======================================================
  // PEAK HOURS
  // =======================================================

  /**
   * Groups PAID orders by local hour of day (0–23).
   * Uses AT TIME ZONE so the hour reflects the shop's
   * local time, not UTC. The timezone string is taken
   * from the shop record — never from user input.
   */
  static async getPeakHours(
    shopId: string,
    from: string,
    to: string,
    timezone: string
  ): Promise<PeakHourRow[]> {
    const result = await pool.query(
      `
      SELECT
        EXTRACT(HOUR FROM created_at AT TIME ZONE $4)::int AS hour,
        COUNT(*)                                            AS order_count,
        COALESCE(SUM(total_amount), 0)                     AS total_revenue
      FROM orders
      WHERE shop_id    = $1
        AND status     = 'PAID'
        AND created_at >= $2::timestamptz
        AND created_at <  $3::timestamptz + INTERVAL '1 day'
      GROUP BY hour
      ORDER BY hour
      `,
      [shopId, from, to, timezone]
    );

    return result.rows.map(row => ({
      hour:          parseInt(row.hour),
      order_count:   parseInt(row.order_count),
      total_revenue: parseFloat(row.total_revenue),
    }));
  }
}