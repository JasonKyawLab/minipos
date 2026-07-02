//
// ADDITIONS for Flow D:
//   QR_BILL_REQUESTED  — customer tapped "Request bill"
//                        → POS shows notification banner
//   QR_TABLE_LOCKED    — order moved to CLOSING
//                        → customer's menu page goes read-only
//   QR_TABLE_REOPENED  — cashier tapped "Reopen"
//                        → customer can order again

export const SOCKET_EVENTS = {
  // Order lifecycle
  ORDER_CREATED:        "order:created",
  ORDER_STATUS_CHANGED: "order:status_changed",
  ORDER_ITEM_ADDED:     "order:item_added",
  ORDER_ITEM_REMOVED:   "order:item_removed",
  ORDER_UPDATED:        "order:updated",

  // Payment
  PAYMENT_PROCESSED:    "payment:processed",
  PAYMENT_FAILED:       "payment:failed",

  // Refund
  REFUND_PROCESSED:     "refund:processed",

  // Table
  TABLE_UPDATED:        "table:updated",
  TABLE_QR_SCANNED:     "table:qr_scanned",

  // Staff
  STAFF_ADDED:          "staff:added",
  STAFF_REMOVED:        "staff:removed",

  // Inventory
  STOCK_UPDATED:        "stock:updated",

  // QR — order flow
  QR_ORDER_PLACED:      "qr:order_placed",
  QR_ORDER_STATUS:      "qr:order_status",

  // QR — Flow D (table session management)
  QR_BILL_REQUESTED:    "qr:bill_requested",    // customer → POS notification
  QR_TABLE_LOCKED:      "qr:table_locked",      // → customer menu goes read-only
  QR_TABLE_REOPENED:    "qr:table_reopened",    // cashier reopens → customer unlocks

  // Kitchen
  KITCHEN_TICKET_CREATED: "kitchen:ticket_created",
  KITCHEN_TICKET_UPDATED: "kitchen:ticket_updated",
  KITCHEN_TICKET_READY:   "kitchen:ticket_ready",
  KITCHEN_ITEM_STATUS:    "kitchen:item_status",

  // Force logout
  POS_FORCE_LOGOUT:     "pos:force_logout",
  KITCHEN_FORCE_LOGOUT: "kitchen:force_logout",
} as const;

export type SocketEvent = typeof SOCKET_EVENTS[keyof typeof SOCKET_EVENTS];