import { pool }      from "../../db/pool.js";
import { appError }  from "../../utils/appError.js";
import { Payment, ProcessPaymentInput } from "./payment.types.js";

export class PaymentRepository {

  /**
   * Process a payment atomically.
   *
   * This is the core transaction. Every side effect of a payment
   * (order status, stock deduction, inventory log) happens here
   * or it all rolls back.
   */
  static async processPayment(input: ProcessPaymentInput): Promise<Payment> {
    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      // ── Step 1: Insert the payment record ──────────────
      const changeAmount =
        input.method === "CASH" && input.receivedAmount != null
          ? parseFloat((input.receivedAmount - input.amount).toFixed(2))
          : null;

      const paymentResult = await client.query<Payment>(
        `
        INSERT INTO payments (
          order_id,
          method,
          amount,
          received_amount,
          change_amount,
          status,
          note,
          paid_at
        )
        VALUES ($1, $2, $3, $4, $5, 'PAID', $6, now())
        RETURNING *
        `,
        [
          input.orderId,
          input.method,
          input.amount,
          input.receivedAmount ?? null,
          changeAmount,
          input.note ?? null,
        ]
      );

      const payment = paymentResult.rows[0];

      // ── Step 2: Mark order as PAID ────────────────────
      await client.query(
        `
        UPDATE orders
        SET
          status       = 'PAID',
          completed_at = now(),
          updated_at   = now()
        WHERE id = $1
        `,
        [input.orderId]
      );

      // ── Step 3: Deduct stock for each active order item ──
      //
      // We fetch order items fresh inside the transaction to ensure
      // we're working with the latest committed data.
      const itemsResult = await client.query(
        `
        SELECT
          oi.id,
          oi.product_item_id,
          oi.qty,
          pi.track_stock,
          pi.stock_qty
        FROM order_items oi
        JOIN product_items pi ON pi.id = oi.product_item_id
        WHERE oi.order_id = $1
          AND oi.status   = 'ACTIVE'
          AND oi.product_item_id IS NOT NULL
        FOR UPDATE OF pi
        -- FOR UPDATE locks the product_items rows so concurrent
        -- payments for the same product cannot both succeed
        -- when stock_qty = 1
        `,
        [input.orderId]
      );

      for (const item of itemsResult.rows) {
        if (!item.track_stock) continue;

        // Guard against overselling
        // (DB CHECK constraint also catches this, but this gives
        //  a cleaner error message)
        if (item.stock_qty < item.qty) {
          throw new appError("INSUFFICIENT_STOCK", 409);
        }

        // Decrement stock
        await client.query(
          `
          UPDATE product_items
          SET
            stock_qty  = stock_qty - $1,
            updated_at = now()
          WHERE id = $2
          `,
          [item.qty, item.product_item_id]
        );

        // Append to inventory ledger
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
          VALUES ($1, $2, 'SALE', $3, $4, 'Auto-deducted on payment', $5)
          `,
          [
            input.shopId,
            item.product_item_id,
            -item.qty,             // negative = stock leaving
            payment.id,            // reference back to this payment
            input.cashierId,
          ]
        );
      }

      await client.query("COMMIT");

      return payment;

    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Find all payments for an order.
   * Supports future split-payment scenarios.
   */
  static async findPaymentsByOrder(orderId: string): Promise<Payment[]> {
    const result = await pool.query<Payment>(
      `
      SELECT *
      FROM payments
      WHERE order_id = $1
      ORDER BY created_at ASC
      `,
      [orderId]
    );

    return result.rows;
  }
}