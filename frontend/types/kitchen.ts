// Kitchen Display System types — mirror of backend kitchen.types.ts

export type KitchenStatus       = "PENDING" | "PREPARING" | "READY" | "SERVED" | "CANCELLED";
export type KitchenTicketStatus = "QUEUED"  | "IN_PROGRESS" | "READY" | "DONE" | "CANCELLED";
export type KitchenPriority     = "NORMAL"  | "HIGH";
export type KitchenRole         = "OWNER"   | "MANAGER" | "CHEF";

export interface KitchenTicketItem {
  id:                string;
  order_id:          string;
  product_name:      string;
  item_name:         string;
  qty:               number;
  modifier_snapshot: Array<{ name: string; price_delta: number }>;
  item_note:         string | null;
  kitchen_status:    KitchenStatus;
}

export interface KitchenTicket {
  id:            string;
  order_id:      string;
  order_no:      string;
  order_type:    string;
  table_number:  string | null;
  customer_name: string | null;
  notes:         string | null;
  ticket_status: KitchenTicketStatus;
  priority:      KitchenPriority;
  queued_at:     string;
  items:         KitchenTicketItem[];
  round:         number;
  is_addon:      boolean;
}

export const ACTIVE_STATUSES: KitchenTicketStatus[] = ["QUEUED", "IN_PROGRESS", "READY"];

export const NEXT_ITEM_STATUS: Partial<Record<KitchenStatus, KitchenStatus>> = {
  PENDING:   "PREPARING",
  PREPARING: "READY",
};
