// =========================================================
// socket.ts
// Path: backend/src/modules/socket/socket.ts
// =========================================================
// Changes in Phase 6:
//   - Added `join_qr_session` event for unauthenticated
//     customer connections. Customers join a room keyed by
//     orderId so they receive live status updates without
//     needing a JWT.
//   - The room name is `qr_session:<orderId>` to avoid
//     collisions with the authenticated `shop:<shopId>` rooms.
// =========================================================

import { Server, Socket } from "socket.io";
import { Server as HttpServer } from "http";
import jwt from "jsonwebtoken";
import { UserRepository } from "../user/user.repository.js";
import { ShopRepository } from "../shop/shop.repository.js";
import { SOCKET_EVENTS } from "./socket.events.js";
import { randomUUID } from "crypto";
import { env } from "../../config/validation.js";

let io: Server;

const connectedClients = new Map<string, {
  socketId: string;
  userId: string;
  shopId?: string;
}>();

// =========================================================
// INITIALIZATION
// =========================================================

export function initSocket(httpServer: HttpServer): Server {
  const corsOrigin = env.SOCKET_CORS_ORIGIN || env.CLIENT_ORIGIN;

  io = new Server(httpServer, {
    cors: {
      origin: corsOrigin,
      credentials: true,
    },
    pingTimeout: 60000,
    pingInterval: 25000,
    transports: ["websocket", "polling"],
  });

  // ── Handshake authentication middleware ──────────────────
  // We make auth OPTIONAL here. QR customers connect without
  // a cookie. We mark them as "guest" and skip the DB lookup.
  // Staff connections still require a valid JWT cookie.
  io.use(async (socket: Socket, next) => {
    const requestId = randomUUID();
    socket.data.requestId = requestId;

    const cookie = socket.handshake.headers.cookie ?? "";
    const match  = cookie.match(/access_token=([^;]+)/);

    // ── Guest connection (no cookie) ──────────────────────
    // Allow through — they can only join qr_session rooms,
    // not shop rooms. Enforced in the join_shop handler.
    if (!match) {
      socket.data.isGuest = true;
      return next();
    }

    // ── Authenticated connection ──────────────────────────
    try {
      const token   = match[1];
      const decoded = jwt.verify(token, env.JWT_SECRET!) as {
        userId: string;
        tokenVersion: number;
      };

      const user = await UserRepository.findById(decoded.userId);
      if (!user || user.is_deleted) return next(new Error("USER_NOT_FOUND"));
      if (user.token_version !== decoded.tokenVersion) return next(new Error("TOKEN_EXPIRED"));
      if (user.status !== "ACTIVE") return next(new Error("USER_NOT_ACTIVE"));

      socket.data.isGuest   = false;
      socket.data.userId    = user.id;
      socket.data.userRole  = user.role;
      socket.data.userName  = user.name;
      socket.data.userEmail = user.email;

      next();
    } catch {
      next(new Error("INVALID_TOKEN"));
    }
  });

  // ── Connection handler ───────────────────────────────────
  io.on("connection", (socket: Socket) => {
    const requestId = socket.data.requestId;

    if (!socket.data.isGuest) {
      const userId = socket.data.userId;
      connectedClients.set(socket.id, { socketId: socket.id, userId });
      console.log(`[Socket][${requestId}] Authenticated: ${socket.data.userEmail}`);
    } else {
      console.log(`[Socket][${requestId}] Guest connected`);
    }

    // =======================================================
    // EVENT: join_shop (authenticated staff only)
    // =======================================================
    socket.on("join_shop", async (shopId: string) => {
      if (socket.data.isGuest) {
        socket.emit("error", { message: "AUTHENTICATION_REQUIRED" });
        return;
      }
      await handleJoinShop(socket, shopId);
    });

    // =======================================================
    // EVENT: join_qr_session (unauthenticated customer)
    // -------------------------------------------------------
    // Customer browser emits this right after placing an order.
    // Payload: { orderId: string }
    // The room name is `qr_session:<orderId>`.
    // We do a basic UUID format check — no DB call needed here
    // because there is no sensitive data in this room. Staff
    // emit to it via emitToQrSession() which uses the same key.
    // =======================================================
    socket.on("join_qr_session", (orderId: string) => {
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(orderId)) {
        socket.emit("error", { message: "INVALID_ORDER_ID" });
        return;
      }

      socket.join(`qr_session:${orderId}`);
      socket.data.qrSessionOrderId = orderId;
      console.log(`[Socket][${requestId}] Guest joined qr_session:${orderId}`);
      socket.emit("joined_qr_session", { orderId });
    });

    // =======================================================
    // EVENT: leave_shop
    // =======================================================
    socket.on("leave_shop", () => {
      const shopId = socket.data.shopId;
      if (shopId) {
        socket.leave(`shop:${shopId}`);
        socket.data.shopId = undefined;
        socket.emit("left_shop", { success: true });
      }
    });

    // =======================================================
    // EVENT: ping (heartbeat)
    // =======================================================
    socket.on("ping", (callback) => {
      if (typeof callback === "function") {
        callback({ timestamp: Date.now(), userId: socket.data.userId ?? "guest" });
      }
    });

    // =======================================================
    // EVENT: get_connected_users (admin dashboard only)
    // =======================================================
    socket.on("get_connected_users", async () => {
      if (socket.data.isGuest || socket.data.userRole !== "ADMIN") {
        socket.emit("error", { message: "UNAUTHORIZED" });
        return;
      }

      const users = Array.from(connectedClients.values()).map(client => ({
        userId:   client.userId,
        socketId: client.socketId,
        shopId:   client.shopId,
      }));

      socket.emit("connected_users", { users });
    });

    // =======================================================
    // EVENT: disconnect
    // =======================================================
    socket.on("disconnect", () => {
      connectedClients.delete(socket.id);
      console.log(`[Socket][${requestId}] Disconnected`);
    });

    socket.on("error", (error) => {
      console.error(`[Socket][${requestId}] Socket error:`, error);
    });
  });

  return io;
}

// =========================================================
// HELPER: Handle joining a shop room (authenticated only)
// =========================================================
async function handleJoinShop(socket: Socket, shopId: string) {
  const requestId = socket.data.requestId;
  const userId    = socket.data.userId;

  try {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(shopId)) {
      socket.emit("error", { message: "INVALID_SHOP_ID" });
      return;
    }

    const member = await ShopRepository.getUserShopMembership(shopId, userId);
    if (!member || !member.is_active) {
      socket.emit("error", { message: "NOT_A_SHOP_MEMBER" });
      return;
    }

    const roomsToLeave = Array.from(socket.rooms).filter(
      room => room.startsWith("shop:") && room !== `shop:${shopId}`
    );
    for (const room of roomsToLeave) socket.leave(room);

    socket.join(`shop:${shopId}`);
    socket.data.shopId = shopId;

    const existing = connectedClients.get(socket.id);
    if (existing) connectedClients.set(socket.id, { ...existing, shopId });

    socket.emit("joined_shop", {
      success:   true,
      shopId,
      role:      member.role,
      timestamp: Date.now(),
    });

    console.log(`[Socket][${requestId}] Joined shop: ${shopId}, role: ${member.role}`);
  } catch (err) {
    console.error(`[Socket][${requestId}] Join shop error:`, err);
    socket.emit("error", { message: "JOIN_FAILED" });
  }
}

// =========================================================
// GETTERS AND EMITTERS
// =========================================================

export function getIO(): Server {
  if (!io) throw new Error("Socket.IO not initialized. Call initSocket() first.");
  return io;
}

export function emitToShop(shopId: string, event: string, data: any): void {
  try {
    if (!io) return;
    io.to(`shop:${shopId}`).emit(event, data);
  } catch (err) {
    console.error(`Failed to emit to shop ${shopId}:`, err);
  }
}

// Emit to a specific customer's QR session room.
// Called by order.service when staff changes an order status.
export function emitToQrSession(orderId: string, event: string, data: any): void {
  try {
    if (!io) return;
    io.to(`qr_session:${orderId}`).emit(event, data);
  } catch (err) {
    console.error(`Failed to emit to qr_session ${orderId}:`, err);
  }
}

export function emitToUser(userId: string, event: string, data: any): void {
  try {
    if (!io) return;
    const client = Array.from(connectedClients.values()).find(c => c.userId === userId);
    if (client) io.to(client.socketId).emit(event, data);
  } catch (err) {
    console.error(`Failed to emit to user ${userId}:`, err);
  }
}

export function getSocketStatus(): { initialized: boolean; connectedClients: number } {
  return {
    initialized: !!io,
    connectedClients: connectedClients.size,
  };
}

