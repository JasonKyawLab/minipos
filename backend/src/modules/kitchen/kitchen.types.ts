export type KitchenStatus =
  | 'PENDING'
  | 'PREPARING'
  | 'READY'
  | 'SERVED'
  | 'CANCELLED';

export type KitchenTicketStatus =
  | 'QUEUED'
  | 'IN_PROGRESS'
  | 'READY'
  | 'DONE'
  | 'CANCELLED';

export type KitchenPriority = 'NORMAL' | 'HIGH';

// ── Core Entities ──────────────────────────────────────────

export interface KitchenStation {
  id: string;
  shop_id: string;
  name: string;
  description: string | null;
  color: string | null;
  is_active: boolean;
  sort_order: number;
  created_at: Date;
  updated_at: Date;
}

export interface KitchenTicket {
  id: string;
  shop_id: string;
  order_id: string;

  order_no: string;
  order_type: string;
  table_number: string | null;
  customer_name: string | null;
  notes: string | null;

  ticket_status: KitchenTicketStatus;
  priority: KitchenPriority;
  station_id: string | null;

  queued_at: Date;
  first_bump_at: Date | null;
  all_ready_at: Date | null;
  completed_at: Date | null;

  created_at: Date;
  updated_at: Date;
}

// ── Enriched ticket with its items (for kitchen display) ───

export interface KitchenTicketItem {
  id: string;            // order_item.id
  order_id: string;
  product_name: string;  // product_name_snapshot
  item_name: string;     // item_name_snapshot
  qty: number;
  modifier_snapshot: any[];
  item_note: string | null;
  kitchen_status: KitchenStatus;
}

export interface KitchenTicketWithItems extends KitchenTicket {
  items: KitchenTicketItem[];
}

// ── Input DTOs ─────────────────────────────────────────────

export interface CreateKitchenStationInput {
  name: string;
  description?: string;
  color?: string;
  sort_order?: number;
}

export interface UpdateKitchenStationInput {
  name?: string;
  description?: string;
  color?: string;
  is_active?: boolean;
  sort_order?: number;
}

export interface ListTicketsFilter {
  shopId: string;
  status?: KitchenTicketStatus | KitchenTicketStatus[];
  stationId?: string;
  limit?: number;
  offset?: number;
}