// =========================================================
// ALL raw SQL for the kitchen module.
// Service layer never imports pool directly.
//
// Key queries:
//   getActiveTickets()  — the kitchen display's main endpoint.
//                         Returns tickets with their items in
//                         ONE round-trip using a JOIN.
//   updateItemStatus()  — bumps a single item and recalculates
//                         the parent ticket status atomically.
// =========================================================

import { pool } from '../../db/pool.js';
import {
  KitchenStation,
  KitchenTicket,
  KitchenTicketWithItems,
  KitchenTicketItem,
  CreateKitchenStationInput,
  UpdateKitchenStationInput,
  ListTicketsFilter,
  KitchenStatus,
  KitchenTicketStatus,
  KitchenPriority,
} from './kitchen.types.js';

export class KitchenRepository {

  // =======================================================
  // KITCHEN STATIONS
  // =======================================================

  static async createStation(
    shopId: string,
    input: CreateKitchenStationInput
  ): Promise<KitchenStation> {
    const result = await pool.query<KitchenStation>(
      `
      INSERT INTO kitchen_stations (shop_id, name, description, color, sort_order)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
      `,
      [
        shopId,
        input.name,
        input.description ?? null,
        input.color      ?? null,
        input.sort_order ?? 0,
      ]
    );
    return result.rows[0];
  }

  static async findAllStations(shopId: string): Promise<KitchenStation[]> {
    const result = await pool.query<KitchenStation>(
      `
      SELECT *
      FROM kitchen_stations
      WHERE shop_id = $1
      ORDER BY sort_order ASC, name ASC
      `,
      [shopId]
    );
    return result.rows;
  }

  static async findStationById(
    stationId: string,
    shopId: string
  ): Promise<KitchenStation | null> {
    const result = await pool.query<KitchenStation>(
      `
      SELECT *
      FROM kitchen_stations
      WHERE id = $1 AND shop_id = $2
      `,
      [stationId, shopId]
    );
    return result.rows[0] ?? null;
  }

  static async updateStation(
    stationId: string,
    shopId: string,
    input: UpdateKitchenStationInput
  ): Promise<KitchenStation | null> {
    const result = await pool.query<KitchenStation>(
      `
      UPDATE kitchen_stations
      SET
        name        = COALESCE($3, name),
        description = COALESCE($4, description),
        color       = COALESCE($5, color),
        is_active   = COALESCE($6, is_active),
        sort_order  = COALESCE($7, sort_order)
      WHERE id = $1 AND shop_id = $2
      RETURNING *
      `,
      [
        stationId,
        shopId,
        input.name        ?? null,
        input.description ?? null,
        input.color       ?? null,
        input.is_active   ?? null,
        input.sort_order  ?? null,
      ]
    );
    return result.rows[0] ?? null;
  }

  static async deleteStation(
    stationId: string,
    shopId: string
  ): Promise<boolean> {
    const result = await pool.query(
      `DELETE FROM kitchen_stations WHERE id = $1 AND shop_id = $2`,
      [stationId, shopId]
    );
    return (result.rowCount ?? 0) > 0;
  }

  // =======================================================
  // STATION ↔ PRODUCT MODEL MAPPING
  // =======================================================

  static async assignModel(
    stationId: string,
    productModelId: string
  ): Promise<void> {
    await pool.query(
      `
      INSERT INTO kitchen_station_categories (station_id, product_model_id)
      VALUES ($1, $2)
      ON CONFLICT DO NOTHING
      `,
      [stationId, productModelId]
    );
  }

  static async unassignModel(
    stationId: string,
    productModelId: string
  ): Promise<boolean> {
    const result = await pool.query(
      `
      DELETE FROM kitchen_station_categories
      WHERE station_id = $1 AND product_model_id = $2
      `,
      [stationId, productModelId]
    );
    return (result.rowCount ?? 0) > 0;
  }

  static async findAssignedModels(stationId: string) {
    const result = await pool.query(
      `
      SELECT pm.id, pm.name, pm.image_url
      FROM kitchen_station_categories ksc
      JOIN product_models pm ON pm.id = ksc.product_model_id
      WHERE ksc.station_id = $1
        AND pm.is_deleted = false
      ORDER BY pm.name ASC
      `,
      [stationId]
    );
    return result.rows;
  }

  // =======================================================
  // KITCHEN TICKETS
  // =======================================================

  /**
   * Create a kitchen ticket when an order is confirmed.
   * Called by KitchenService.createTicket() which is triggered
   * from order.service after status → CONFIRMED.
   */
  static async createTicket(params: {
    shopId: string;
    orderId: string;
    orderNo: string;
    orderType: string;
    tableNumber: string | null;
    customerName: string | null;
    notes: string | null;
  }): Promise<KitchenTicket> {
    const result = await pool.query<KitchenTicket>(
      `
      INSERT INTO kitchen_tickets (
        shop_id, order_id, order_no, order_type,
        table_number, customer_name, notes
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (shop_id, order_id) DO NOTHING
      RETURNING *
      `,
      [
        params.shopId,
        params.orderId,
        params.orderNo,
        params.orderType,
        params.tableNumber,
        params.customerName,
        params.notes,
      ]
    );
    // ON CONFLICT DO NOTHING means a duplicate confirm is safe
    return result.rows[0];
  }

  /**
   * Get active tickets for the kitchen display.
   * Returns QUEUED, IN_PROGRESS, READY tickets with their items.
   *
   * Why one query with aggregation?
   *   The kitchen display renders as a grid of ticket cards.
   *   Each card needs the ticket header + all its items.
   *   Fetching tickets then N×item fetches would be O(N) queries.
   *   We aggregate items as JSONB in SQL → always 1 round-trip.
   */
  static async getActiveTickets(
    shopId: string,
    filter: {
      statusList?: KitchenTicketStatus[];
      stationId?: string;
      limit: number;
      offset: number;
    }
  ): Promise<KitchenTicketWithItems[]> {
    const conditions: string[] = ['kt.shop_id = $1'];
    const values: any[] = [shopId];
    let idx = 2;

    // Default: show all active statuses
    const statusList = filter.statusList ?? ['QUEUED', 'IN_PROGRESS', 'READY'];
    conditions.push(`kt.ticket_status = ANY($${idx++}::kitchen_ticket_status[])`);
    values.push(statusList);

    if (filter.stationId) {
      conditions.push(`kt.station_id = $${idx++}`);
      values.push(filter.stationId);
    }

    values.push(filter.limit);
    values.push(filter.offset);

    const result = await pool.query(
      `
      SELECT
        kt.id,
        kt.shop_id,
        kt.order_id,
        kt.order_no,
        kt.order_type,
        kt.table_number,
        kt.customer_name,
        kt.notes,
        kt.ticket_status,
        kt.priority,
        kt.station_id,
        kt.queued_at,
        kt.first_bump_at,
        kt.all_ready_at,
        kt.completed_at,
        kt.created_at,
        kt.updated_at,

        -- Aggregate items as a JSON array in one query
        COALESCE(
          json_agg(
            json_build_object(
              'id',               oi.id,
              'order_id',         oi.order_id,
              'product_name',     oi.product_name_snapshot,
              'item_name',        oi.item_name_snapshot,
              'qty',              oi.qty,
              'modifier_snapshot',oi.modifier_snapshot,
              'item_note',        oi.item_note,
              'kitchen_status',   oi.kitchen_status
            )
            ORDER BY oi.created_at ASC
          ) FILTER (WHERE oi.id IS NOT NULL AND oi.status = 'ACTIVE'),
          '[]'::json
        ) AS items

      FROM kitchen_tickets kt
      LEFT JOIN order_items oi ON oi.order_id = kt.order_id
      WHERE ${conditions.join(' AND ')}
      GROUP BY kt.id
      ORDER BY kt.priority DESC, kt.queued_at ASC
      LIMIT $${idx++} OFFSET $${idx++}
      `,
      values
    );

    return result.rows;
  }

  static async findTicketByOrderId(
    orderId: string,
    shopId: string
  ): Promise<KitchenTicket | null> {
    const result = await pool.query<KitchenTicket>(
      `
      SELECT * FROM kitchen_tickets
      WHERE order_id = $1 AND shop_id = $2
      `,
      [orderId, shopId]
    );
    return result.rows[0] ?? null;
  }

  static async findTicketWithItems(
    ticketId: string,
    shopId: string
  ): Promise<KitchenTicketWithItems | null> {
    const ticketResult = await pool.query<KitchenTicket>(
      `SELECT * FROM kitchen_tickets WHERE id = $1 AND shop_id = $2`,
      [ticketId, shopId]
    );
    if (ticketResult.rows.length === 0) return null;

    const ticket = ticketResult.rows[0];

    const itemsResult = await pool.query<KitchenTicketItem>(
      `
      SELECT
        id,
        order_id,
        product_name_snapshot  AS product_name,
        item_name_snapshot     AS item_name,
        qty,
        modifier_snapshot,
        item_note,
        kitchen_status
      FROM order_items
      WHERE order_id = $1
        AND status   = 'ACTIVE'
      ORDER BY created_at ASC
      `,
      [ticket.order_id]
    );

    return { ...ticket, items: itemsResult.rows };
  }

  /**
   * Update ticket status and record performance timestamps.
   * Called directly for DONE / CANCELLED transitions.
   */
  static async updateTicketStatus(
    ticketId: string,
    shopId: string,
    status: KitchenTicketStatus
  ): Promise<KitchenTicket | null> {
    const result = await pool.query<KitchenTicket>(
      `
      UPDATE kitchen_tickets
      SET
        ticket_status = $3::kitchen_ticket_status,
        completed_at  = CASE WHEN $3 = 'DONE'      THEN now() ELSE completed_at END,
        updated_at    = now()
      WHERE id = $1 AND shop_id = $2
      RETURNING *
      `,
      [ticketId, shopId, status]
    );
    return result.rows[0] ?? null;
  }

  static async updateTicketPriority(
    ticketId: string,
    shopId: string,
    priority: KitchenPriority
  ): Promise<KitchenTicket | null> {
    const result = await pool.query<KitchenTicket>(
      `
      UPDATE kitchen_tickets
      SET priority = $3::kitchen_priority, updated_at = now()
      WHERE id = $1 AND shop_id = $2
      RETURNING *
      `,
      [ticketId, shopId, priority]
    );
    return result.rows[0] ?? null;
  }

  /**
   * Cancel the ticket and all its PENDING/PREPARING items.
   * Called when an order is cancelled after a ticket exists.
   */
  static async cancelTicket(
    orderId: string,
    shopId: string
  ): Promise<void> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      await client.query(
        `
        UPDATE kitchen_tickets
        SET ticket_status = 'CANCELLED', updated_at = now()
        WHERE order_id = $1 AND shop_id = $2
        `,
        [orderId, shopId]
      );

      // Only cancel items that haven't been served yet
      await client.query(
        `
        UPDATE order_items
        SET kitchen_status = 'CANCELLED'
        WHERE order_id = $1
          AND kitchen_status IN ('PENDING', 'PREPARING')
        `,
        [orderId]
      );

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  // =======================================================
  // ITEM STATUS UPDATES (the core kitchen workflow)
  // =======================================================

  /**
   * Update a single item's kitchen_status and recalculate
   * the parent ticket status — all in one transaction.
   *
   * Why in the repository and not the service?
   *   The ticket status recalculation reads the current state
   *   of ALL items for this order. Doing that with FOR UPDATE
   *   inside a transaction prevents two concurrent cooks from
   *   both marking the last item as READY and both thinking
   *   they should transition the ticket to READY.
   */
  static async updateItemKitchenStatus(params: {
    itemId: string;
    orderId: string;
    shopId: string;
    newStatus: KitchenStatus;
  }): Promise<{ item: any; ticket: KitchenTicket }> {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // 1. Update the specific item
      const itemResult = await client.query(
        `
        UPDATE order_items
        SET kitchen_status = $3::kitchen_status
        WHERE id       = $1
          AND order_id = $2
          AND status   = 'ACTIVE'
        RETURNING *
        `,
        [params.itemId, params.orderId, params.newStatus]
      );

      if (itemResult.rows.length === 0) {
        throw new Error('ORDER_ITEM_NOT_FOUND');
      }

      const item = itemResult.rows[0];

      // 2. Re-read all ACTIVE items to determine ticket status
      //    FOR UPDATE locks the ticket row so concurrent updates
      //    don't race on the status recalculation
      const ticketResult = await client.query<KitchenTicket>(
        `
        SELECT kt.* FROM kitchen_tickets kt
        WHERE kt.order_id = $1 AND kt.shop_id = $2
        FOR UPDATE
        `,
        [params.orderId, params.shopId]
      );

      if (ticketResult.rows.length === 0) {
        throw new Error('KITCHEN_TICKET_NOT_FOUND');
      }

      const ticket = ticketResult.rows[0];

      // 3. Read current status of all ACTIVE items
      const itemsResult = await client.query(
        `
        SELECT kitchen_status
        FROM order_items
        WHERE order_id = $1 AND status = 'ACTIVE'
        `,
        [params.orderId]
      );

      const statuses = itemsResult.rows.map((r) => r.kitchen_status as KitchenStatus);

      // 4. Determine new ticket status from item statuses
      const newTicketStatus = deriveTicketStatus(statuses, ticket.ticket_status);

      // 5. Build timestamp updates
      const now = new Date().toISOString();
      const isFirstBump =
        params.newStatus === 'PREPARING' && !ticket.first_bump_at;
      const isAllReady =
        newTicketStatus === 'READY' && !ticket.all_ready_at;

      // 6. Update ticket
      const updatedTicketResult = await client.query<KitchenTicket>(
  `
  UPDATE kitchen_tickets
  SET
    ticket_status = $2::kitchen_ticket_status,
    first_bump_at = CASE WHEN $3 THEN $4::timestamptz ELSE first_bump_at END,
    all_ready_at  = CASE WHEN $5 THEN $4::timestamptz ELSE all_ready_at  END,
    updated_at    = now()
  WHERE id = $1
  RETURNING *
  `,
  [
    ticket.id,       // $1 → WHERE id = $1
    newTicketStatus, // $2 → ticket_status
    isFirstBump,     // $3 → CASE WHEN $3
    now,             // $4 → timestamptz value (shared by both CASE)
    isAllReady,      // $5 → CASE WHEN $5
  ]
);
      await client.query('COMMIT');

      return { item, ticket: updatedTicketResult.rows[0] };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
}

// ── Helper: derive ticket status from item statuses ────────
// Pure function — easier to unit test in isolation.
function deriveTicketStatus(
  itemStatuses: KitchenStatus[],
  currentTicketStatus: KitchenTicketStatus
): KitchenTicketStatus {
  if (itemStatuses.length === 0) return currentTicketStatus;

  const active = itemStatuses.filter((s) => s !== 'CANCELLED');

  if (active.length === 0) return 'CANCELLED';

  const allServed    = active.every((s) => s === 'SERVED');
  const allReadyPlus = active.every((s) => s === 'READY' || s === 'SERVED');
  const anyPreparing = active.some((s) => s === 'PREPARING');
  const anyPending   = active.some((s) => s === 'PENDING');

  if (allServed)    return 'DONE';
  if (allReadyPlus) return 'READY';
  if (anyPreparing || (!anyPending && !allReadyPlus)) return 'IN_PROGRESS';

  return 'QUEUED';
}