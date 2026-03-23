// =========================================================
// refund.types.ts
// Path: backend/src/modules/refund/refund.types.ts
// =========================================================

// ── Refund Type ───────────────────────────────────────────

export type RefundType = "FULL" | "PARTIAL";

// ── Core Entity ───────────────────────────────────────────

export interface Refund {
  id: string;
  order_id: string;
  payment_id: string | null;

  type: RefundType;
  amount: number;
  reason: string | null;

  processed_by: string | null;
  created_at: Date;
}

// ── Input DTOs ────────────────────────────────────────────

// One item in a partial refund request.
// restock is per-item because:
//   - one item may be undamaged (restock = true)
//   - another may be broken/cooked badly (restock = false)
export interface RefundItemInput {
  order_item_id: string;
  qty: number;

  // true  → increment stock + log inventory movement
  // false → no stock change (item damaged / consumed / unusable)
  restock: boolean;

  // Optional per-item reason (e.g. "broken from factory")
  reason?: string;
}

export interface ProcessRefundInput {
  orderId: string;
  shopId: string;
  requesterId: string;
  type: RefundType;

  // Full refund: one restock decision applies to ALL items
  // Partial refund: restock is per item in items[]
  restock?: boolean;

  // Required for PARTIAL, ignored for FULL
  items?: RefundItemInput[];

  reason?: string;
}

// ── Response ──────────────────────────────────────────────

export interface RefundResult {
  refund: Refund;
  refund_amount: number;
  restocked_items: number;  // count of items that were restocked
  skipped_restock: number;  // count of items that were NOT restocked
}