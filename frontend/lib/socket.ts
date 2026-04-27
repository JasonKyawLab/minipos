// =========================================================
// lib/socket.ts — Socket.IO client instance
//
// autoConnect: false means we control WHEN to connect.
// Connection is started inside SocketProvider components,
// NOT globally — we don't want sockets open on every page.
// =========================================================

import { io, Socket } from "socket.io-client";

let socket: Socket | null = null;

/**
 * Returns a singleton Socket.IO instance.
 * Safe to call multiple times — returns the same instance.
 */
export function getSocket(): Socket {
  if (!socket) {
    socket = io(process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001", {
      withCredentials: true,
      autoConnect: false,
      reconnectionAttempts: 5,
      reconnectionDelay: 2000,
      transports: ["websocket", "polling"],
    });
  }
  return socket;
}

export default getSocket;