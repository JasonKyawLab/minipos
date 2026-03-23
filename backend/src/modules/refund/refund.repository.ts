// =========================================================
// refund.repository.ts
// Path: backend/src/modules/refund/refund.repository.ts
// =========================================================
// The most critical file in the refund module.
//
// Two atomic transactions:
//
// processFullRefund():
//   BEGIN
//     INSERT INTO refunds
//     UPDATE orders SET status = REFUNDED
//     UPDATE payments SET status = REFUNDED
//     Fetch all ACTIVE order items
//     Lock product_items rows individually (only tracked items)
//     For each item:
//       UPDATE order_items SET status = REFUNDED
//       IF restock AND track_stock:
//         UPDATE product_items stock_qty + qty
//         INSERT inventory_movements (REFUND, +qty)
//   COMMIT
//
// processPartialRefund():
//   BEGIN
//     INSERT INTO refunds
//     UPDATE payments SET status = PARTIALLY_REFUNDED
//     For each item in refund request:
//       Fetch order_item + product_item (no FOR UPDATE in JOIN)
//       Lock product_items row individually if restocking
//       UPDATE order_items SET status = REFUNDED
//       IF restock AND track_stock:
//         UPDATE product_items stock_qty + qty
//         INSERT inventory_movements (REFUND, +qty)
//   COMMIT
//
// WHY separate lock step?
//   PostgreSQL does not allow FOR UPDATE on the nullable side
//   of a LEFT JOIN (error: "FOR UPDATE cannot be applied to
//   the nullable side of an outer join"). We use LEFT JOIN
//   because product_item_id is nullable on order_items.
//   The fix: fetch first with LEFT JOIN, then lock the
//   product_items row in a separate SELECT FOR UPDATE.
// =========================================================

import { pool } from "../../db/pool.js";
import { Refund, RefundItemInput } from "./refund.types.js";
import { appError } from "../../utils/appError.js";

export class RefundRepository {

  // =======================================================
  // FULL REFUND
  // =======================================================

  /**
   * Process a full refund atomically.
   *
   * Refunds the entire order:
   *   - All ACTIVE items get status = REFUNDED
   *   - Inventory restocked based on restock flag
   *   - Order status → REFUNDED
   *   - Payment status → REFUNDED
   */
  static async processFullRefund(params: {
    orderId: string;
    shopId: string;
    paymentId: string;
    refundAmount: number;
    restock: boolean;
    reason?: string;
    processedBy: string;
  }): Promise<Refund> {
    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      // ── Step 1: Insert refund record ──────────────────
      const refundResult = await client.query<Refund>(
        `
        INSERT INTO refunds (
          order_id,
          payment_id,
          amount,
          reason,
          processed_by
        )
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *
        `,
        [
          params.orderId,
          params.paymentId,
          params.refundAmount,
          params.reason ?? null,
          params.processedBy,
        ]
      );

      const refund = refundResult.rows[0];

      // ── Step 2: Mark order as REFUNDED ────────────────
      await client.query(
        `
        UPDATE orders
        SET
          status     = 'REFUNDED',
          updated_at = now()
        WHERE id = $1
        `,
        [params.orderId]
      );

      // ── Step 3: Mark payment as REFUNDED ─────────────
      await client.query(
        `
        UPDATE payments
        SET status = 'REFUNDED'
        WHERE id = $1
        `,
        [params.paymentId]
      );

      // ── Step 4: Fetch all ACTIVE order items ──────────
      //
      // Use LEFT JOIN (not INNER JOIN) because product_item_id
      // is nullable — some order items may not have a linked
      // product (e.g. custom items).
      //
      // We do NOT use FOR UPDATE here because PostgreSQL does
      // not allow FOR UPDATE on the nullable side of a LEFT JOIN.
      // Instead we lock product_items rows individually below.
      const itemsResult = await client.query(
        `
        SELECT
          oi.id            AS order_item_id,
          oi.product_item_id,
          oi.qty,
          pi.track_stock,
          pi.stock_qty
        FROM order_items oi
        LEFT JOIN product_items pi ON pi.id = oi.product_item_id
        WHERE oi.order_id = $1
          AND oi.status   = 'ACTIVE'
        `,
        [params.orderId]
      );

      // ── Step 5: Lock product_items rows individually ──
      //
      // Lock only the rows we will actually UPDATE (restock=true,
      // has a linked product, and tracks stock). This prevents
      // concurrent payments for the same product from both
      // succeeding when stock_qty = 1.
      if (params.restock) {
        for (const item of itemsResult.rows) {
          if (item.product_item_id && item.track_stock) {
            await client.query(
              `SELECT id FROM product_items WHERE id = $1 FOR UPDATE`,
              [item.product_item_id]
            );
          }
        }
      }

      // ── Step 6: Process each item ─────────────────────
      for (const item of itemsResult.rows) {

        // Mark order item as REFUNDED
        await client.query(
          `
          UPDATE order_items
          SET status = 'REFUNDED'
          WHERE id = $1
          `,
          [item.order_item_id]
        );

        // Restock only if:
        //   - restock flag is true
        //   - item has a linked product (product_item_id not null)
        //   - item tracks stock
        if (
          params.restock &&
          item.product_item_id &&
          item.track_stock
        ) {
          // Increment stock
          await client.query(
            `
            UPDATE product_items
            SET
              stock_qty  = stock_qty + $1,
              updated_at = now()
            WHERE id = $2
            `,
            [item.qty, item.product_item_id]
          );

          // Log inventory movement
          await client.query(
            `
            INSERT INTO inventory_movements (
              shop_id,
              product_item_id,
              type,
              quantity,
              reference_id,
              notes,
              created_by
            )
            VALUES ($1, $2, 'REFUND', $3, $4, $5, $6)
            `,
            [
              params.shopId,
              item.product_item_id,
              item.qty,              // positive = stock returning
              refund.id,             // reference back to this refund
              `Full refund restocked — ${params.reason ?? "no reason given"}`,
              params.processedBy,
            ]
          );
        }

        // If restock = false: no stock change, no inventory movement.
        // The reason is recorded in the refunds table.
        // This covers: broken goods, consumed food, damaged items.
      }

      await client.query("COMMIT");

      return refund;

    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  // =======================================================
  // PARTIAL REFUND
  // =======================================================

  /**
   * Process a partial refund atomically.
   *
   * Refunds specific items only:
   *   - Only specified items get status = REFUNDED
   *   - Restock decision is per item
   *   - Order status stays PAID
   *   - Payment status → PARTIALLY_REFUNDED
   */
  static async processPartialRefund(params: {
    orderId: string;
    shopId: string;
    paymentId: string;
    refundAmount: number;
    items: RefundItemInput[];
    reason?: string;
    processedBy: string;
  }): Promise<Refund> {
    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      // ── Step 1: Insert refund record ──────────────────
      const refundResult = await client.query<Refund>(
        `
        INSERT INTO refunds (
          order_id,
          payment_id,
          amount,
          reason,
          processed_by
        )
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *
        `,
        [
          params.orderId,
          params.paymentId,
          params.refundAmount,
          params.reason ?? null,
          params.processedBy,
        ]
      );

      const refund = refundResult.rows[0];

      // ── Step 2: Mark payment as PARTIALLY_REFUNDED ────
      await client.query(
        `
        UPDATE payments
        SET status = 'PARTIALLY_REFUNDED'
        WHERE id = $1
        `,
        [params.paymentId]
      );

      // ── Step 3: Process each requested item ──────────
      for (const refundItem of params.items) {

        // ── Fetch the order item and its linked product ─
        //
        // We use LEFT JOIN because product_item_id is nullable.
        // We do NOT use FOR UPDATE here because PostgreSQL does
        // not allow FOR UPDATE on the nullable side of a LEFT JOIN.
        // We lock the product_items row separately below if needed.
        const itemResult = await client.query(
          `
          SELECT
            oi.id              AS order_item_id,
            oi.product_item_id,
            oi.qty             AS original_qty,
            oi.status,
            pi.track_stock,
            pi.stock_qty
          FROM order_items oi
          LEFT JOIN product_items pi ON pi.id = oi.product_item_id
          WHERE oi.id       = $1
            AND oi.order_id = $2
          `,
          [refundItem.order_item_id, params.orderId]
        );

        if (itemResult.rows.length === 0) {
          throw new appError("ORDER_ITEM_NOT_FOUND", 404, { itemId: refundItem.order_item_id });
        }

        const item = itemResult.rows[0];

        // Cannot refund an item that is already refunded or cancelled
        if (item.status !== "ACTIVE") {
          throw new appError("ORDER_ITEM_ALREADY_REFUNDED", 400, { itemId: refundItem.order_item_id });
        }

        // Cannot refund more than the original quantity
        if (refundItem.qty > item.original_qty) {
          throw new appError("REFUND_QTY_EXCEEDS_ORIGINAL", 400, { itemId: refundItem.order_item_id });
        }

        // ── Lock product_items row individually if needed ─
        //
        // Only lock if we will actually restock this item.
        // This prevents concurrent stock updates from racing.
        if (
          refundItem.restock &&
          item.product_item_id &&
          item.track_stock
        ) {
          await client.query(
            `SELECT id FROM product_items WHERE id = $1 FOR UPDATE`,
            [item.product_item_id]
          );
        }

        // Mark order item as REFUNDED
        await client.query(
          `
          UPDATE order_items
          SET status = 'REFUNDED'
          WHERE id = $1
          `,
          [item.order_item_id]
        );

        // Restock only if:
        //   - this item's restock = true
        //   - has a linked product
        //   - item tracks stock
        if (
          refundItem.restock &&
          item.product_item_id &&
          item.track_stock
        ) {
          // Increment stock by the refunded qty
          await client.query(
            `
            UPDATE product_items
            SET
              stock_qty  = stock_qty + $1,
              updated_at = now()
            WHERE id = $2
            `,
            [refundItem.qty, item.product_item_id]
          );

          // Log inventory movement
          await client.query(
            `
            INSERT INTO inventory_movements (
              shop_id,
              product_item_id,
              type,
              quantity,
              reference_id,
              notes,
              created_by
            )
            VALUES ($1, $2, 'REFUND', $3, $4, $5, $6)
            `,
            [
              params.shopId,
              item.product_item_id,
              refundItem.qty,         // positive = stock returning
              refund.id,
              refundItem.reason
                ?? params.reason
                ?? "Partial refund restocked",
              params.processedBy,
            ]
          );
        }

        // If restock = false: no stock change.
        // Covers: broken goods, consumed food, damaged items.
      }

      await client.query("COMMIT");

      return refund;

    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  // =======================================================
  // READ
  // =======================================================

  /**
   * Find all refunds for an order.
   */
  static async findRefundsByOrder(orderId: string): Promise<Refund[]> {
    const result = await pool.query<Refund>(
      `
      SELECT *
      FROM refunds
      WHERE order_id = $1
      ORDER BY created_at ASC
      `,
      [orderId]
    );

    return result.rows;
  }

  /**
   * Sum all refunds already processed for an order.
   * Used to prevent refunding more than the original payment.
   */
  static async getTotalRefundedAmount(orderId: string): Promise<number> {
    const result = await pool.query(
      `
      SELECT COALESCE(SUM(amount), 0) AS total
      FROM refunds
      WHERE order_id = $1
      `,
      [orderId]
    );

    return parseFloat(result.rows[0].total);
  }
}