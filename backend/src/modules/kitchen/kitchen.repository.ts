// =========================================================
// kitchen.repository.ts
// Path: backend/src
// /modules/kitchen/kitchen.repository.ts
// =========================================================

import { pool } from "../../db/pool.js";
import {
  
  KitchenTicket,
  KitchenTicketWithItems,
  KitchenTicketItem,
  KitchenStatus,
  KitchenTicketStatus,
  KitchenPriority,
  CreateKitchenStationInput,
  UpdateKitchenStationInput,
} from "./kitchen.types.js";

export class KitchenRepository {

  // =======================================================
  // KITCHEN STATIONS
  // =======================================================

  static async createStation(shopId: string, input: CreateKitchenStationInput) {
    const result = await pool.query(
      `
      INSERT INTO kitchen_stations (shop_id, name, description, color, is_active, sort_order)
      VALUES ($1, $2, $3, $4, TRUE, $5)
      RETURNING *
      `,
      [shopId, input.name, input.description ?? null, input.color ?? null, input.sort_order ?? 0]
    );
    return result.rows[0];
  }

  static async findAllStations(shopId: string) {
    const result = await pool.query(
      `SELECT * FROM kitchen_stations WHERE shop_id = $1 ORDER BY sort_order ASC, name ASC`,
      [shopId]
    );
    return result.rows;
  }

  static async updateStation(stationId: string, shopId: string, input: UpdateKitchenStationInput) {
    const result = await pool.query(
      `
      UPDATE kitchen_stations
      SET
        name        = COALESCE($3, name),
        description = COALESCE($4, description),
        color       = COALESCE($5, color),
        is_active   = COALESCE($6, is_active),
        sort_order  = COALESCE($7, sort_order),
        updated_at  = now()
      WHERE id = $1 AND shop_id = $2
      RETURNING *
      `,
      [stationId, shopId, input.name ?? null, input.description ?? null, input.color ?? null, input.is_active ?? null, input.sort_order ?? null]
    );
    return result.rows[0] ?? null;
  }

  static async deleteStation(stationId: string, shopId: string): Promise<boolean> {
    const result = await pool.query(
      `DELETE FROM kitchen_stations WHERE id = $1 AND shop_id = $2`,
      [stationId, shopId]
    );
    return (result.rowCount ?? 0) > 0;
  }

  static async assignModel(stationId: string, productModelId: string): Promise<void> {
    await pool.query(
      `INSERT INTO kitchen_station_categories (station_id, product_model_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [stationId, productModelId]
    );
  }

  static async unassignModel(stationId: string, productModelId: string): Promise<boolean> {
    const result = await pool.query(
      `DELETE FROM kitchen_station_categories WHERE station_id = $1 AND product_model_id = $2`,
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
      WHERE ksc.station_id = $1 AND pm.is_deleted = false
      ORDER BY pm.name ASC
      `,
      [stationId]
    );
    return result.rows;
  }

  // =======================================================
  // KITCHEN TICKETS
  // =======================================================

  static async createTicket(params: {
    shopId:       string;
    orderId:      string;
    orderNo:      string;
    orderType:    string;
    tableNumber:  string | null;
    customerName: string | null;
    notes:        string | null;
    round:        number;
    is_addon:     boolean;
  }): Promise<KitchenTicket> {
    const result = await pool.query<KitchenTicket>(
      `
      INSERT INTO kitchen_tickets (
        shop_id, order_id, order_no, order_type,
        table_number, customer_name, notes,
        round, is_addon
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
      `,
      [
        params.shopId, params.orderId, params.orderNo, params.orderType,
        params.tableNumber, params.customerName, params.notes,
        params.round, params.is_addon,
      ]
    );
    return result.rows[0];
  }

  // ── Stamp items with ticket_id after ticket creation ─────
  //
  // Called immediately after createTicket() by every service
  // that creates a kitchen ticket. Stamps all ACTIVE, PENDING
  // order_items that have no ticket_id yet with this ticket's id.
  //
  // WHY: items are inserted before the ticket exists (the ticket
  // is the result of confirming the items). Stamping after creation
  // is the only reliable way to scope items to a round.
  //
  // Only stamps items with ticket_id IS NULL to avoid re-stamping
  // items from a previous round that are still ACTIVE.
  static async stampItemsWithTicket(orderId: string, ticketId: string): Promise<void> {
    await pool.query(
      `
      UPDATE order_items
      SET ticket_id = $2
      WHERE order_id  = $1
        AND ticket_id IS NULL
        AND status    = 'ACTIVE'
      `,
      [orderId, ticketId]
    );
  }

  // ── Get active tickets for kitchen display ────────────────
  //
  // Each ticket only shows items stamped with its own ticket_id.
  // Items without a ticket_id (legacy data before migration) fall
  // back to showing on the most recent active ticket for the order.
  static async getActiveTickets(
    shopId: string,
    filter: {
      statusList?: KitchenTicketStatus[];
      stationId?:  string;
      limit:       number;
      offset:      number;
    }
  ): Promise<KitchenTicketWithItems[]> {
    const conditions: string[] = ['kt.shop_id = $1'];
    const values: any[] = [shopId];
    let idx = 2;

    const statusList = filter.statusList ?? ['QUEUED', 'IN_PROGRESS', 'READY'];
    conditions.push(`kt.ticket_status = ANY($${idx++}::kitchen_ticket_status[])`);
    values.push(statusList);

    if (filter.stationId) {
      conditions.push(`kt.station_id = $${idx++}`);
      values.push(filter.stationId);
    }

    values.push(filter.limit);
    values.push(filter.offset);

    const result = await pool.query<KitchenTicketWithItems>(
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
        kt.round,
        kt.is_addon,
        kt.queued_at,
        kt.first_bump_at,
        kt.all_ready_at,
        kt.completed_at,
        kt.created_at,
        kt.updated_at,

        COALESCE(
          json_agg(
            json_build_object(
              'id',                oi.id,
              'order_id',          oi.order_id,
              'product_name',      oi.product_name_snapshot,
              'item_name',         oi.item_name_snapshot,
              'qty',               oi.qty,
              'modifier_snapshot', oi.modifier_snapshot,
              'item_note',         oi.item_note,
              'kitchen_status',    oi.kitchen_status
            )
            ORDER BY oi.created_at ASC
          ) FILTER (WHERE oi.id IS NOT NULL AND oi.status = 'ACTIVE'),
          '[]'::json
        ) AS items

      FROM kitchen_tickets kt
      LEFT JOIN order_items oi ON oi.ticket_id = kt.id
      WHERE ${conditions.join(' AND ')}
      GROUP BY kt.id
      ORDER BY kt.priority DESC, kt.queued_at ASC
      LIMIT $${idx++} OFFSET $${idx++}
      `,
      values
    );

    return result.rows;
  }

  // ── Get a single ticket with its items ───────────────────
  static async findTicketWithItems(
    ticketId: string,
    shopId:   string
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
      WHERE ticket_id = $1
        AND status    = 'ACTIVE'
      ORDER BY created_at ASC
      `,
      [ticketId]
    );

    return { ...ticket, items: itemsResult.rows };
  }

  // Lightweight lookup by the kitchen_ticket's own id — used by
// cancelTicketByStaff, which receives the ticket id (not the
// order id) from the route param :ticketId. Do NOT confuse this
// with findTicketByOrderId, which looks up by order_id and can
// return a DIFFERENT ticket when an order has multiple rounds.
static async findTicketById(ticketId: string, shopId: string): Promise<KitchenTicket | null> {
  const result = await pool.query<KitchenTicket>(
    `SELECT * FROM kitchen_tickets WHERE id = $1 AND shop_id = $2`,
    [ticketId, shopId]
  );
  return result.rows[0] ?? null;
}

  static async findTicketByOrderId(orderId: string, shopId: string): Promise<KitchenTicket | null> {
    const result = await pool.query<KitchenTicket>(
      `
      SELECT * FROM kitchen_tickets
      WHERE order_id = $1 AND shop_id = $2
      ORDER BY round DESC
      LIMIT 1
      `,
      [orderId, shopId]
    );
    return result.rows[0] ?? null;
  }

  static async getTicketRoundCount(orderId: string): Promise<number> {
    const result = await pool.query(
      `SELECT COUNT(*) AS count FROM kitchen_tickets WHERE order_id = $1`,
      [orderId]
    );
    return parseInt(result.rows[0]?.count ?? '0', 10);
  }

  static async updateTicketStatus(
    ticketId: string,
    shopId:   string,
    status:   KitchenTicketStatus
  ): Promise<KitchenTicket | null> {
    const result = await pool.query<KitchenTicket>(
      `
      UPDATE kitchen_tickets
      SET
        ticket_status = $3::kitchen_ticket_status,
        completed_at  = CASE WHEN $3 = 'DONE' THEN now() ELSE completed_at END,
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
    shopId:   string,
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

  static async cancelTicket(orderId: string, shopId: string): Promise<void> {
    await pool.query(
      `
      UPDATE kitchen_tickets
      SET ticket_status = 'CANCELLED', updated_at = now()
      WHERE order_id = $1 AND shop_id = $2
        AND ticket_status NOT IN ('DONE', 'CANCELLED')
      `,
      [orderId, shopId]
    );

    await pool.query(
      `
      UPDATE order_items
      SET kitchen_status = 'CANCELLED'
      WHERE order_id = $1
        AND kitchen_status IN ('PENDING', 'PREPARING')
      `,
      [orderId]
    );
  }

  static async updateItemKitchenStatus(params: {
    itemId:    string;
    orderId:   string;
    shopId:    string;
    newStatus: KitchenStatus;
  }): Promise<{ item: KitchenTicketItem; ticket: KitchenTicket }> {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const itemResult = await client.query<KitchenTicketItem>(
        `
        UPDATE order_items
        SET kitchen_status = $1::kitchen_status
        WHERE id = $2 AND order_id = $3 AND status = 'ACTIVE'
        RETURNING
          id, order_id,
          product_name_snapshot AS product_name,
          item_name_snapshot    AS item_name,
          qty, modifier_snapshot, item_note, kitchen_status
        `,
        [params.newStatus, params.itemId, params.orderId]
      );

      if (itemResult.rows.length === 0) throw new Error('ORDER_ITEM_NOT_FOUND');

      const item = itemResult.rows[0];

      // Lock the ticket that owns this item (via ticket_id)
      // Fall back to most recent non-done ticket if ticket_id not set (legacy)
      const ticketResult = await client.query<KitchenTicket>(
        `
        SELECT kt.* FROM kitchen_tickets kt
        JOIN order_items oi ON oi.ticket_id = kt.id
        WHERE oi.id = $1 AND kt.shop_id = $2
          AND kt.ticket_status NOT IN ('DONE', 'CANCELLED')
        LIMIT 1
        FOR UPDATE OF kt
        `,
        [params.itemId, params.shopId]
      );

      // Fallback for legacy items without ticket_id
      const resolvedTicketResult = ticketResult.rows.length > 0
        ? ticketResult
        : await client.query<KitchenTicket>(
            `
            SELECT kt.* FROM kitchen_tickets kt
            WHERE kt.order_id = $1 AND kt.shop_id = $2
              AND kt.ticket_status NOT IN ('DONE', 'CANCELLED')
            ORDER BY kt.round DESC
            LIMIT 1
            FOR UPDATE
            `,
            [params.orderId, params.shopId]
          );

      if (resolvedTicketResult.rows.length === 0) throw new Error('KITCHEN_TICKET_NOT_FOUND');

      const ticket = resolvedTicketResult.rows[0];

      // Read all items for THIS ticket to derive status
      const itemsResult = await client.query<{ kitchen_status: KitchenStatus }>(
        `
        SELECT kitchen_status
        FROM order_items
        WHERE ticket_id = $1 AND status = 'ACTIVE'
        `,
        [ticket.id]
      );

      // Fallback for legacy: read all order items
      const statusRows = itemsResult.rows.length > 0
        ? itemsResult.rows
        : (await client.query<{ kitchen_status: KitchenStatus }>(
            `SELECT kitchen_status FROM order_items WHERE order_id = $1 AND status = 'ACTIVE'`,
            [params.orderId]
          )).rows;

      const statuses = statusRows.map(r => r.kitchen_status);
      const newTicketStatus = deriveTicketStatus(statuses, ticket.ticket_status);

      const now         = new Date().toISOString();
      const isFirstBump = params.newStatus === 'PREPARING' && !ticket.first_bump_at;
      const isAllReady  = newTicketStatus === 'READY' && !ticket.all_ready_at;

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
        [ticket.id, newTicketStatus, isFirstBump, now, isAllReady]
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

function deriveTicketStatus(
  statuses:      KitchenStatus[],
  currentStatus: KitchenTicketStatus
): KitchenTicketStatus {
  const active = statuses.filter(s => s !== 'CANCELLED' && s !== 'SERVED');
  if (active.length === 0) return currentStatus;
  const allServed    = statuses.every(s => s === 'SERVED');
  const allReadyPlus = active.every(s => s === 'READY');
  const anyPreparing = active.some(s => s === 'PREPARING');
  if (allServed)    return 'DONE';
  if (allReadyPlus) return 'READY';
  if (anyPreparing) return 'IN_PROGRESS';
  const allPending = active.every(s => s === 'PENDING');
  if (allPending) return 'QUEUED';
  return 'IN_PROGRESS';
}