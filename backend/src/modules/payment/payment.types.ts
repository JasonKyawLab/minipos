// ── Enums (mirror DB enums) ───────────────────────────────

export type PaymentMethod = "CASH" | "COD";
// Future payment methods — add here and in DB enum when ready:
//   | "CARD"              ← Stripe / card terminal
//   | "ONLINE_TRANSFER"   ← bank transfer
//   | "WALLET"            ← GrabPay, PromptPay etc.

export type PaymentStatus =
  | "PENDING"
  | "PAID"
  | "FAILED"
  | "REFUNDED"
  | "PARTIALLY_REFUNDED";

// ── Core Entity ───────────────────────────────────────────

export interface Payment {
  id: string;
  order_id: string;

  method: PaymentMethod;
  amount: number;

  // CASH only: how much the customer physically handed over
  received_amount: number | null;
  // CASH only: change returned to customer
  change_amount: number | null;

  status: PaymentStatus;

  // Future: gateway transaction reference (Stripe charge ID etc.)
  transaction_ref: string | null;
  note: string | null;

  paid_at: Date | null;
  created_at: Date;
}

// ── Input DTOs ────────────────────────────────────────────

export interface ProcessPaymentInput {
  orderId: string;
  shopId: string;
  cashierId: string;
  method: PaymentMethod;
  amount: number;
  receivedAmount?: number; // required for CASH
  note?: string;
}

// ── Response ──────────────────────────────────────────────

export interface PaymentResult {
  payment: Payment;
  change_amount: number | null;
  order_no: string;
  total_amount: number;
}