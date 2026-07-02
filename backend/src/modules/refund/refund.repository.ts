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
import { pool } from "../../db/pool.js";
import { Refund, RefundItemInput, ListRefundsFilter } from "./refund.types.js";

export class RefundRepository {

  // =======================================================
  // FULL REFUND
  // =======================================================

  static async processFullRefund(params: {
    orderId: string;
    shopId: string;
    paymentId: string;
    refundAmount: number;
    restock: boolean;
    reason?: string;
    processedBy: string;
    idempotency_key?: string;
  }): Promise<{ refund: Refund; was_duplicate: boolean }> {
    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      //  — Check idempotency key before doing anything
      if (params.idempotency_key) {
        const existing = await client.query<Refund>(
          `SELECT * FROM refunds WHERE idempotency_key = $1`,
          [params.idempotency_key]
        );

        if (existing.rows.length > 0) {
          await client.query("COMMIT");
          return { refund: existing.rows[0], was_duplicate: true };
        }
      }

      // ──  Insert refund record ──────────────────
      const refundResult = await client.query<Refund>(
        `
        INSERT INTO refunds (
          order_id,
          payment_id,
          amount,
          reason,
          idempotency_key,
          processed_by
        )
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *
        `,
        [
          params.orderId,
          params.paymentId,
          params.refundAmount,
          params.reason      ?? null,
          params.idempotency_key ?? null,
          params.processedBy,
        ]
      );

      const refund = refundResult.rows[0];

      // ──  Mark order as REFUNDED ────────────────
      await client.query(
        `
        UPDATE orders
        SET status     = 'REFUNDED',
            updated_at = now()
        WHERE id = $1
        `,
        [params.orderId]
      );

      // ── Mark payment as REFUNDED ─────────────
      await client.query(
        `UPDATE payments SET status = 'REFUNDED' WHERE id = $1`,
        [params.paymentId]
      );

      // ──  Process each ACTIVE order item ────────
      // — lock rows with FOR UPDATE to prevent race condition
      const itemsResult = await client.query(
        `
        SELECT
          oi.id              AS order_item_id,
          oi.product_item_id,
          oi.qty,
          oi.refunded_qty,
          oi.status
        FROM order_items oi
        WHERE oi.order_id = $1
          AND oi.status   = 'ACTIVE'
        FOR UPDATE OF oi
        `,
        [params.orderId]
      );

      for (const item of itemsResult.rows) {
        const remainingQty = item.qty - item.refunded_qty;

        await client.query(
          `
          UPDATE order_items
          SET refunded_qty = refunded_qty + $1,
              status       = CASE
                               WHEN refunded_qty + $1 >= qty THEN 'REFUNDED'
                               ELSE status
                             END
          WHERE id = $2
          `,
          [remainingQty, item.order_item_id]
        );

        if (params.restock && item.product_item_id) {
          // Lock the product_item row separately — avoids FOR UPDATE on LEFT JOIN
          const piResult = await client.query(
            `
            SELECT id, track_stock, stock_qty
            FROM product_items
            WHERE id = $1
            FOR UPDATE
            `,
            [item.product_item_id]
          );

          const pi = piResult.rows[0];
          if (pi && pi.track_stock) {
            await client.query(
              `
              UPDATE product_items
              SET stock_qty  = stock_qty + $1,
                  updated_at = now()
              WHERE id = $2
              `,
              [remainingQty, item.product_item_id]
            );

            await client.query(
              `
              INSERT INTO inventory_movements (
                shop_id, product_item_id, type, quantity,
                reference_id, notes, created_by
              )
              VALUES ($1, $2, 'REFUND', $3, $4, $5, $6)
              `,
              [
                params.shopId,
                item.product_item_id,
                remainingQty,
                refund.id,
                `Full refund restocked — ${params.reason ?? "no reason given"}`,
                params.processedBy,
              ]
            );
          }
        }
      }

      await client.query("COMMIT");
      return { refund, was_duplicate: false };

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

  static async processPartialRefund(params: {
    orderId: string;
    shopId: string;
    paymentId: string;
    refundAmount: number;
    items: RefundItemInput[];
    reason?: string;
    processedBy: string;
    idempotency_key?: string;
  }): Promise<{ refund: Refund; was_duplicate: boolean }> {
    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      //— Check idempotency key before doing anything
      if (params.idempotency_key) {
        const existing = await client.query<Refund>(
          `SELECT * FROM refunds WHERE idempotency_key = $1`,
          [params.idempotency_key]
        );

        if (existing.rows.length > 0) {
          await client.query("COMMIT");
          return { refund: existing.rows[0], was_duplicate: true };
        }
      }

      // Insert refund record ──────────────────
      const refundResult = await client.query<Refund>(
        `
        INSERT INTO refunds (
          order_id,
          payment_id,
          amount,
          reason,
          idempotency_key,
          processed_by
        )
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *
        `,
        [
          params.orderId,
          params.paymentId,
          params.refundAmount,
          params.reason          ?? null,
          params.idempotency_key ?? null,
          params.processedBy,
        ]
      );

      const refund = refundResult.rows[0];

      // ──  Mark payment as PARTIALLY_REFUNDED ────
      await client.query(
        `UPDATE payments SET status = 'PARTIALLY_REFUNDED' WHERE id = $1`,
        [params.paymentId]
      );

      // ──Process each requested item ──────────
      for (const refundItem of params.items) {

        // Lock oi row — safe because no JOIN
        const itemResult = await client.query(
          `
          SELECT
            oi.id              AS order_item_id,
            oi.product_item_id,
            oi.qty,
            oi.refunded_qty,
            oi.status
          FROM order_items oi
          WHERE oi.id       = $1
            AND oi.order_id = $2
          FOR UPDATE OF oi
          `,
          [refundItem.order_item_id, params.orderId]
        );

        if (itemResult.rows.length === 0) {
          throw new Error(`ORDER_ITEM_NOT_FOUND`);
        }

        const item = itemResult.rows[0];

        if (item.status !== "ACTIVE") {
          throw new Error(`ORDER_ITEM_ALREADY_REFUNDED`);
        }

        const remainingQty = item.qty - item.refunded_qty;
        if (refundItem.qty > remainingQty) {
          throw new Error(`REFUND_QTY_EXCEEDS_ORIGINAL`);
        }

        await client.query(
          `
          UPDATE order_items
          SET refunded_qty = refunded_qty + $1,
              status       = CASE
                               WHEN refunded_qty + $1 >= qty THEN 'REFUNDED'
                               ELSE status
                             END
          WHERE id = $2
          `,
          [refundItem.qty, item.order_item_id]
        );

        if (refundItem.restock && item.product_item_id) {
          // Lock product_item separately — avoids FOR UPDATE on LEFT JOIN
          const piResult = await client.query(
            `
            SELECT id, track_stock, stock_qty
            FROM product_items
            WHERE id = $1
            FOR UPDATE
            `,
            [item.product_item_id]
          );

          const pi = piResult.rows[0];
          if (pi && pi.track_stock) {
            await client.query(
              `
              UPDATE product_items
              SET stock_qty  = stock_qty + $1,
                  updated_at = now()
              WHERE id = $2
              `,
              [refundItem.qty, item.product_item_id]
            );

            await client.query(
              `
              INSERT INTO inventory_movements (
                shop_id, product_item_id, type, quantity,
                reference_id, notes, created_by
              )
              VALUES ($1, $2, 'REFUND', $3, $4, $5, $6)
              `,
              [
                params.shopId,
                item.product_item_id,
                refundItem.qty,
                refund.id,
                refundItem.reason ?? params.reason ?? "Partial refund restocked",
                params.processedBy,
              ]
            );
          }
        }
      }

      await client.query("COMMIT");
      return { refund, was_duplicate: false };

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

  // — pagination added
  static async findRefundsByOrder(filter: ListRefundsFilter): Promise<Refund[]> {
    const limit  = filter.limit  ?? 20;
    const offset = filter.offset ?? 0;

    const result = await pool.query<Refund>(
      `
      SELECT *
      FROM refunds
      WHERE order_id = $1
      ORDER BY created_at ASC
      LIMIT $2 OFFSET $3
      `,
      [filter.orderId, limit, offset]
    );

    return result.rows;
  }

  static async findRefundByIdempotencyKey(idempotencyKey: string): Promise<Refund | null> {
    const result = await pool.query<Refund>(
      `
      SELECT *
      FROM refunds
      WHERE idempotency_key = $1
      `,
      [idempotencyKey]
    );

    return result.rows[0] ?? null;
  }

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