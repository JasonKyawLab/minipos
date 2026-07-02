// ── Refund Type ───────────────────────────────────────────
export type RefundType = "FULL" | "PARTIAL";

// ── Core Entity ───────────────────────────────────────────
export interface Refund {
  id: string;
  order_id: string;
  payment_id: string | null;
  amount: number;
  reason: string | null;
  idempotency_key: string | null;
  processed_by: string | null;
  created_at: Date;
}

// ── Input DTOs ────────────────────────────────────────────
export interface RefundItemInput {
  order_item_id: string;
  qty: number;
  restock: boolean;
  reason?: string;
}

export interface ProcessRefundInput {
  orderId: string;
  shopId: string;
  requesterId: string;
  type: RefundType;
  restock?: boolean;
  items?: RefundItemInput[];
  reason?: string;
  idempotency_key?: string;  //  — optional, prevents duplicate refunds
}

// ── Query / Filter ────────────────────────────────────────
export interface ListRefundsFilter {
  orderId: string;
  limit?: number;   // — pagination
  offset?: number;  // — pagination
}

// ── Response ──────────────────────────────────────────────
export interface RefundResult {
  refund: Refund;
  refund_amount: number;
  restocked_items: number;
  skipped_restock: number;
  was_duplicate?: boolean;  // — true if idempotency key already existed
}