// =========================================================
// order.types.ts
// Path: backend/src/modules/order/order.types.ts
// =========================================================

// ── Enums (mirror DB enums) ───────────────────────────────

export type OrderType =
  | "RETAIL"
  | "DINE_IN"
  | "TAKEAWAY"
  | "ONLINE"
  | "DELIVERY"
  | "PICKUP"
  | "QR";

export type OrderStatus = 'OPEN' | 'CONFIRMED' | 'CLOSING' | 'PAID' | 'CANCELLED' | 'REFUNDED';
  
export type OrderItemStatus = "ACTIVE" | "CANCELLED" | "REFUNDED";

// ── Core Entities ─────────────────────────────────────────

export interface Order {
  id: string;
  shop_id: string;
  cashier_id: string | null;

  order_no: string;
  order_type: OrderType;

  table_id: string | null;

  subtotal: number;
  tax_amount: number;
  discount_amount: number;
  total_amount: number;

  status: OrderStatus;

  customer_name: string | null;
  customer_phone: string | null;
  delivery_address: string | null;
  delivery_note: string | null;
  notes: string | null;

  cancelled_at: Date | null;
  completed_at: Date | null;

  created_at: Date;
  updated_at: Date;
}

export interface OrderItem {
  id: string;
  order_id: string;
  product_item_id: string | null;

  product_name_snapshot: string;
  item_name_snapshot: string;
  unit_price_snapshot: number;

  qty: number;
  subtotal: number;

  // JSONB array — snapshot of selected modifiers at time of sale
  // Example: [{ name: "Extra Egg", price_delta: 15 }]
  modifier_snapshot: ModifierSnapshot[];

  item_note: string | null;
  status: OrderItemStatus;

  created_at: Date;
}

export interface ModifierSnapshot {
  modifier_option_id: string;
  name: string;
  price_delta: number;
}

// ── Input DTOs ────────────────────────────────────────────

export interface CreateOrderInput {
  shopId: string;
  cashierId: string | null;
  orderType: OrderType;
  tableId?: string;
  customerName?: string;
  customerPhone?: string;
  deliveryAddress?: string;
  deliveryNote?: string;
  notes?: string;
}

export interface AddOrderItemInput {
  orderId: string;
  shopId: string;
  productItemId: string;
  qty: number;
  modifiers?: ModifierSnapshot[];
  itemNote?: string;
}

export interface UpdateOrderItemInput {
  qty: number;
}

// ── Query / Filter ────────────────────────────────────────

export interface ListOrdersFilter {
  shopId: string;
  status?: OrderStatus;
  orderType?: OrderType;
  from?: string;   // ISO date string
  to?: string;     // ISO date string
  limit?: number;
  offset?: number;
}

// ── Response shapes ───────────────────────────────────────
// Used by service layer to return enriched order data

export interface OrderWithItems extends Order {
  items: OrderItem[];
}