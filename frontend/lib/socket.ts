// =========================================================
// lib/socket.ts — Socket.IO client instance
//
// WHY createFreshSocket() exists:
//   The kitchen display runs in a secured terminal context.
//   The terminal_session cookie is set AFTER the user logs
//   in with their PIN. If a stale singleton socket exists
//   from before login (no terminal_session cookie), it joins
//   no terminal room — emitToKitchenTerminals misses it.
//
//   createFreshSocket() disconnects and destroys the old
//   instance, forcing a new handshake that carries the now-
//   present terminal_session cookie. The backend then auto-
//   joins the socket to terminal:<shopId>:KITCHEN.
//
//   getSocket() is still used by pages that don't need a
//   fresh connection (QR customer status page, etc.).
// =========================================================

import { io, Socket } from "socket.io-client";

let socket: Socket | null = null;
const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";

export function getSocket(): Socket {
  if (!socket) {
    socket = io(API_BASE, {
      path:                "/socket.io",
      withCredentials:     true,
      autoConnect:         false,
      reconnectionAttempts: 5,
      reconnectionDelay:   2000,
      transports:          ["websocket", "polling"],
    });
  }
  return socket;
}

// Call this on terminal pages (Kitchen display, POS display)
// BEFORE connecting — ensures the handshake carries the
// terminal_session cookie that was set after PIN login.
export function createFreshSocket(): Socket {
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }
  return getSocket();
}

export default getSocket;