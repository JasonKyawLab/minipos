// =========================================================
// socket.events.ts
// Path: backend/src/socket/socket.events.ts
// =========================================================
// Central registry of all Socket.IO event names.
//
// Why a constants file?
//   Typos in event name strings are silent bugs.
//   Using constants means TypeScript catches mismatches at
//   compile time instead of at runtime.
//
// Usage in services:
//   import { SOCKET_EVENTS } from "../../socket/socket.events.js";
//   getIO().to(`shop:${shopId}`).emit(SOCKET_EVENTS.ORDER_CREATED, data);
// =========================================================

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
} as const;

export type SocketEvent = typeof SOCKET_EVENTS[keyof typeof SOCKET_EVENTS];