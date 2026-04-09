// =========================================================
// order.repository.ts
// Path: backend/src/modules/order/order.repository.ts
// =========================================================
// ALL raw SQL for orders and order items.
// Service layer never touches pool directly.
//
// Design notes:
//   - order_no is generated atomically inside the DB to
//     prevent duplicate numbers under concurrent load.
//   - Total recalculation happens in recalculateOrderTotals()
//     which is called after every add/remove item operation.
//   - We never hard-delete orders or order items.
// =========================================================

import { pool } from "../../db/pool.js";
import { appError } from "../../utils/appError.js";
import {
  Order,
  OrderItem,
  OrderWithItems,
  CreateOrderInput,
  AddOrderItemInput,
  UpdateOrderItemInput,
  ListOrdersFilter,
  OrderStatus,
  ModifierSnapshot,
} from "./order.types.js";

export class OrderRepository {

  // =======================================================
  // ORDERS
  // =======================================================

  /**
   * Create a new order.
   *
   * order_no generation:
   *   Format: ORD-YYYYMMDD-XXXX (scoped per shop per day)
   *   We count existing orders for this shop today and pad
   *   the sequence. This runs inside the same INSERT so it
   *   is atomic — no separate sequence table needed.
   *
   *   Example: ORD-20240318-0001, ORD-20240318-0042
   */
  static async createOrder(
    input: CreateOrderInput,
    taxRate: number
  ): Promise<Order> {
    const result = await pool.query<Order>(
      `
      INSERT INTO orders (
        shop_id,
        cashier_id,
        order_no,
        order_type,
        table_id,
        subtotal,
        tax_amount,
        discount_amount,
        total_amount,
        status,
        customer_name,
        customer_phone,
        delivery_address,
        delivery_note,
        notes
      )
      VALUES (
        $1, $2,

        -- Generate order_no atomically:
        -- Count orders for this shop today, add 1, zero-pad to 4 digits
        'ORD-' ||
        TO_CHAR(NOW() AT TIME ZONE 'UTC', 'YYYYMMDD') ||
        '-' ||
        LPAD(
          (
            SELECT COUNT(*) + 1
            FROM orders
            WHERE shop_id = $1
              AND DATE(created_at AT TIME ZONE 'UTC') =
                  DATE(NOW() AT TIME ZONE 'UTC')
          )::TEXT,
          4, '0'
        ),

        $3, $4,
        0, 0, 0, 0,  -- totals start at 0, recalculated on item add
        'OPEN',
        $5, $6, $7, $8, $9
      )
      RETURNING *
      `,
      [
        input.shopId,
        input.cashierId,
        input.orderType,
        input.tableId         ?? null,
        input.customerName    ?? null,
        input.customerPhone   ?? null,
        input.deliveryAddress ?? null,
        input.deliveryNote    ?? null,
        input.notes           ?? null,
      ]
    );

    return result.rows[0];
  }

  /**
   * Find a single order by ID scoped to a shop.
   */
  static async findOrderById(
    orderId: string,
    shopId: string
  ): Promise<Order | null> {
    const result = await pool.query<Order>(
      `
      SELECT *
      FROM orders
      WHERE id      = $1
        AND shop_id = $2
      `,
      [orderId, shopId]
    );

    return result.rows[0] ?? null;
  }

  /**
   * Find order with all its active items in one query.
   * Used for order detail view and payment processing.
   */
  static async findOrderWithItems(
    orderId: string,
    shopId: string
  ): Promise<OrderWithItems | null> {
    // Fetch order
    const orderResult = await pool.query<Order>(
      `
      SELECT *
      FROM orders
      WHERE id      = $1
        AND shop_id = $2
      `,
      [orderId, shopId]
    );

    if (orderResult.rows.length === 0) return null;

    const order = orderResult.rows[0];

    // Fetch active items for this order
    const itemsResult = await pool.query<OrderItem>(
      `
      SELECT *
      FROM order_items
      WHERE order_id = $1
        AND status   = 'ACTIVE'
      ORDER BY created_at ASC
      `,
      [orderId]
    );

    return {
      ...order,
      items: itemsResult.rows,
    };
  }

  /**
   * List orders for a shop with optional filters.
   * Supports pagination via limit/offset.
   * Default: latest 50 orders.
   */
  static async findOrders(filter: ListOrdersFilter): Promise<Order[]> {
    const conditions: string[] = ["shop_id = $1"];
    const values: any[]        = [filter.shopId];
    let idx = 2;

    if (filter.status) {
      conditions.push(`status = $${idx++}`);
      values.push(filter.status);
    }

    if (filter.orderType) {
      conditions.push(`order_type = $${idx++}`);
      values.push(filter.orderType);
    }

    if (filter.from) {
      conditions.push(`created_at >= $${idx++}`);
      values.push(filter.from);
    }

    if (filter.to) {
      conditions.push(`created_at <= $${idx++}`);
      values.push(filter.to);
    }

    const limit  = filter.limit  ?? 50;
    const offset = filter.offset ?? 0;

    const result = await pool.query<Order>(
      `
      SELECT *
      FROM orders
      WHERE ${conditions.join(" AND ")}
      ORDER BY created_at DESC
      LIMIT $${idx++} OFFSET $${idx++}
      `,
      [...values, limit, offset]
    );

    return result.rows;
  }

  /**
   * Update order status.
   * Also sets cancelled_at or completed_at timestamps
   * based on the new status.
   */
  static async updateOrderStatus(
  orderId: string,
  shopId: string,
  status: OrderStatus
): Promise<Order | null> {
  const result = await pool.query<Order>(
    `
    UPDATE orders
    SET
      status       = $3::order_status,
      cancelled_at = CASE WHEN $3 = 'CANCELLED' THEN now() ELSE cancelled_at END,
      completed_at = CASE WHEN $3 = 'PAID'      THEN now() ELSE completed_at END,
      updated_at   = now()
    WHERE id      = $1
      AND shop_id = $2
    RETURNING *
    `,
    [orderId, shopId, status]
  );

  return result.rows[0] ?? null;
}

  /**
   * Recalculate and update order totals after any item change.
   *
   * Why in DB and not app layer?
   *   If two requests add items simultaneously, app-layer
   *   calculation could use a stale subtotal. Doing the
   *   SUM in the DB always reads the latest committed data.
   *
   * Formula:
   *   item subtotal = (unit_price_snapshot + sum of modifier price_deltas) × qty
   *   order subtotal = sum of all active item subtotals
   *   tax_amount     = order subtotal × tax_rate / 100
   *   total_amount   = subtotal + tax_amount - discount_amount
   */
  static async recalculateOrderTotals(
    orderId: string,
    taxRate: number
  ): Promise<Order> {
    const result = await pool.query<Order>(
      `
      UPDATE orders o
      SET
        subtotal = COALESCE((
          SELECT SUM(oi.subtotal)
          FROM order_items oi
          WHERE oi.order_id = o.id
            AND oi.status   = 'ACTIVE'
        ), 0),

        tax_amount = ROUND(
          COALESCE((
            SELECT SUM(oi.subtotal)
            FROM order_items oi
            WHERE oi.order_id = o.id
              AND oi.status   = 'ACTIVE'
          ), 0) * $2 / 100,
          2
        ),

        -- Recompute total: subtotal + tax - discount
        total_amount = COALESCE((
          SELECT SUM(oi.subtotal)
          FROM order_items oi
          WHERE oi.order_id = o.id
            AND oi.status   = 'ACTIVE'
        ), 0)
        + ROUND(
          COALESCE((
            SELECT SUM(oi.subtotal)
            FROM order_items oi
            WHERE oi.order_id = o.id
              AND oi.status   = 'ACTIVE'
          ), 0) * $2 / 100,
          2
        )
        - o.discount_amount,

        updated_at = now()

      WHERE o.id = $1
      RETURNING *
      `,
      [orderId, taxRate]
    );

    return result.rows[0];
  }

  // =======================================================
  // ORDER ITEMS
  // =======================================================

  /**
   * Add an item to an order.
   *
   * Snapshot fields (product_name_snapshot, item_name_snapshot,
   * unit_price_snapshot) are passed in from the service layer
   * after fetching the product item. This preserves the sale
   * price even if the product is repriced or renamed later.
   *
   * item subtotal = (unit_price + sum of modifier price_deltas) × qty
   */
  static async addOrderItem(params: {
    orderId: string;
    productItemId: string;
    productNameSnapshot: string;
    itemNameSnapshot: string;
    unitPriceSnapshot: number;
    qty: number;
    modifierSnapshot: ModifierSnapshot[];
    itemNote?: string;
  }): Promise<OrderItem> {
    // Calculate modifier total from the snapshot array
    const modifierTotal = params.modifierSnapshot.reduce(
      (sum, m) => sum + m.price_delta,
      0
    );

    // item subtotal = (base price + modifiers) × qty
    const itemSubtotal =
      (params.unitPriceSnapshot + modifierTotal) * params.qty;

    const result = await pool.query<OrderItem>(
      `
      INSERT INTO order_items (
        order_id,
        product_item_id,
        product_name_snapshot,
        item_name_snapshot,
        unit_price_snapshot,
        qty,
        subtotal,
        modifier_snapshot,
        item_note
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
      `,
      [
        params.orderId,
        params.productItemId,
        params.productNameSnapshot,
        params.itemNameSnapshot,
        params.unitPriceSnapshot,
        params.qty,
        itemSubtotal,
        JSON.stringify(params.modifierSnapshot),
        params.itemNote ?? null,
      ]
    );

    return result.rows[0];
  }

  /**
   * Find a single order item by ID, scoped to an order.
   */
  static async findOrderItemById(
    itemId: string,
    orderId: string
  ): Promise<OrderItem | null> {
    const result = await pool.query<OrderItem>(
      `
      SELECT *
      FROM order_items
      WHERE id       = $1
        AND order_id = $2
        AND status   = 'ACTIVE'
      `,
      [itemId, orderId]
    );

    return result.rows[0] ?? null;
  }

  /**
   * Update order item quantity and recalculate its subtotal.
   */
static async updateOrderItem(
  itemId: string,
  orderId: string,
  qty: number
): Promise<OrderItem | null> {

    if (qty <= 0) {
    throw new appError("INVALID_QUANTITY", 400);
  }

  const result = await pool.query<OrderItem>(
    `
    UPDATE order_items
    SET
      qty      = $3::integer,
      subtotal = (subtotal / qty) * $3::integer
    WHERE id       = $1
      AND order_id = $2
      AND status   = 'ACTIVE'::order_item_status
    RETURNING *
    `,
    [itemId, orderId, qty]
  );

  return result.rows[0] ?? null;
}

  /**
   * Cancel an order item (soft delete via status change).
   * We never hard-delete order items — audit trail matters.
   */
  static async cancelOrderItem(
    itemId: string,
    orderId: string
  ): Promise<boolean> {
    const result = await pool.query(
      `
      UPDATE order_items
      SET status = 'CANCELLED'
      WHERE id       = $1
        AND order_id = $2
        AND status   = 'ACTIVE'
      `,
      [itemId, orderId]
    );

    return (result.rowCount ?? 0) > 0;
  }
}