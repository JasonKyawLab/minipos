// =========================================================
// socket.ts
// Path: backend/src/socket/socket.ts
// Line: 1-250
// =========================================================

import { Server, Socket } from "socket.io";
import { Server as HttpServer } from "http";
import jwt from "jsonwebtoken";
import { UserRepository } from "../user/user.repository.js";
import { ShopRepository } from "../shop/shop.repository.js";
import { SOCKET_EVENTS } from "./socket.events.js";
import { randomUUID } from "crypto";
import { env } from "../../config/validation.js";

// Singleton instance
let io: Server;

// Store connected clients for targeted notifications
const connectedClients = new Map<string, { socketId: string; userId: string; shopId?: string }>();

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
    // Reduce memory usage with these options
    pingTimeout: 60000,
    pingInterval: 25000,
    transports: ["websocket", "polling"],
  });

  // ── Handshake authentication middleware ──────────────────
  io.use(async (socket: Socket, next) => {
    const requestId = randomUUID();
    socket.data.requestId = requestId;

    try {
      // Extract JWT from cookie
      const cookie = socket.handshake.headers.cookie ?? "";
      const match = cookie.match(/access_token=([^;]+)/);

      if (!match) {
        console.log(`[Socket][${requestId}] No access token found`);
        return next(new Error("NOT_AUTHENTICATED"));
      }

      const token = match[1];
      const decoded = jwt.verify(token, env.JWT_SECRET!) as {
        userId: string;
        tokenVersion: number;
      };

      // Verify user exists and is active
      const user = await UserRepository.findById(decoded.userId);
      if (!user || user.is_deleted) {
        console.log(`[Socket][${requestId}] User not found or deleted: ${decoded.userId}`);
        return next(new Error("USER_NOT_FOUND"));
      }

      if (user.token_version !== decoded.tokenVersion) {
        console.log(`[Socket][${requestId}] Token version mismatch for user: ${decoded.userId}`);
        return next(new Error("TOKEN_EXPIRED"));
      }

      if (user.status !== "ACTIVE") {
        console.log(`[Socket][${requestId}] User not active: ${decoded.userId}`);
        return next(new Error("USER_NOT_ACTIVE"));
      }

      // Attach user data to socket
      socket.data.userId = user.id;
      socket.data.userRole = user.role;
      socket.data.userName = user.name;
      socket.data.userEmail = user.email;

      console.log(`[Socket][${requestId}] Authenticated: ${user.email} (${user.id})`);

      next();
    } catch (err) {
      console.error(`[Socket][${requestId}] Auth error:`, err);
      next(new Error("INVALID_TOKEN"));
    }
  });

  // ── Connection handler ───────────────────────────────────
  io.on("connection", (socket: Socket) => {
    const userId = socket.data.userId;
    const requestId = socket.data.requestId;

    // Store client connection
    connectedClients.set(socket.id, {
      socketId: socket.id,
      userId,
    });

    console.log(`[Socket][${requestId}] Connected: ${userId}`);

    // =======================================================
    // EVENT: join_shop
    // =======================================================
    socket.on(SOCKET_EVENTS.TABLE_UPDATED, async (shopId: string) => {
      // This event name is used for joining, but we'll use a dedicated event
      // For backward compatibility, we'll handle both
      await handleJoinShop(socket, shopId);
    });

    // Use proper event name
    socket.on("join_shop", async (shopId: string) => {
      await handleJoinShop(socket, shopId);
    });

    // =======================================================
    // EVENT: leave_shop
    // =======================================================
    socket.on("leave_shop", () => {
      const shopId = socket.data.shopId;
      if (shopId) {
        socket.leave(`shop:${shopId}`);
        socket.data.shopId = undefined;
        console.log(`[Socket][${requestId}] Left shop: ${shopId}`);
        socket.emit("left_shop", { success: true });
      }
    });

    // =======================================================
    // EVENT: ping (heartbeat)
    // =======================================================
    socket.on("ping", (callback) => {
      if (typeof callback === "function") {
        callback({ timestamp: Date.now(), userId });
      }
    });

    // =======================================================
    // EVENT: get_connected_users (for admin dashboard)
    // =======================================================
    socket.on("get_connected_users", async () => {
      // Only admins can see connected users
      if (socket.data.userRole !== "ADMIN") {
        socket.emit("error", { message: "UNAUTHORIZED" });
        return;
      }

      const users = Array.from(connectedClients.values()).map(client => ({
        userId: client.userId,
        socketId: client.socketId,
        shopId: client.shopId,
      }));

      socket.emit("connected_users", { users });
    });

    // =======================================================
    // EVENT: disconnect
    // =======================================================
    socket.on("disconnect", () => {
      connectedClients.delete(socket.id);
      console.log(`[Socket][${requestId}] Disconnected: ${userId}`);
    });

    // =======================================================
    // ERROR HANDLER
    // =======================================================
    socket.on("error", (error) => {
      console.error(`[Socket][${requestId}] Socket error:`, error);
    });
  });

  return io;
}

// =========================================================
// HELPER: Handle joining a shop room
// =========================================================
async function handleJoinShop(socket: Socket, shopId: string) {
  const requestId = socket.data.requestId;
  const userId = socket.data.userId;

  try {
    // Validate shopId format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(shopId)) {
      socket.emit("error", { message: "INVALID_SHOP_ID" });
      return;
    }

    // Verify user is a member of this shop
    const member = await ShopRepository.getUserShopMembership(shopId, userId);

    if (!member || !member.is_active) {
      socket.emit("error", { message: "NOT_A_SHOP_MEMBER" });
      return;
    }

    // Leave any previous shop rooms
    const roomsToLeave = Array.from(socket.rooms).filter(
      room => room.startsWith("shop:") && room !== `shop:${shopId}`
    );

    for (const room of roomsToLeave) {
      socket.leave(room);
      console.log(`[Socket][${requestId}] Left room: ${room}`);
    }

    // Join the new shop room
    socket.join(`shop:${shopId}`);
    socket.data.shopId = shopId;

    // Update connected clients map
    const existing = connectedClients.get(socket.id);
    if (existing) {
      connectedClients.set(socket.id, { ...existing, shopId });
    }

    console.log(`[Socket][${requestId}] Joined shop: ${shopId}, role: ${member.role}`);

    // Send confirmation with shop details
    socket.emit("joined_shop", {
      success: true,
      shopId,
      role: member.role,
      timestamp: Date.now(),
    });

  } catch (err) {
    console.error(`[Socket][${requestId}] Join shop error:`, err);
    socket.emit("error", { message: "JOIN_FAILED" });
  }
}

// =========================================================
// GETTER: Get Socket.IO instance
// =========================================================
export function getIO(): Server {
  if (!io) {
    throw new Error("Socket.IO not initialized. Call initSocket() first.");
  }
  return io;
}

// =========================================================
// HELPER: Emit to a shop room with error handling
// =========================================================
export function emitToShop(shopId: string, event: string, data: any): void {
  try {
    if (!io) {
      console.warn(`Socket.IO not initialized, cannot emit to shop ${shopId}`);
      return;
    }
    io.to(`shop:${shopId}`).emit(event, data);
  } catch (err) {
    console.error(`Failed to emit to shop ${shopId}:`, err);
  }
}

// =========================================================
// HELPER: Emit to a specific user (for direct notifications)
// =========================================================
export function emitToUser(userId: string, event: string, data: any): void {
  try {
    if (!io) return;

    const client = Array.from(connectedClients.values()).find(
      c => c.userId === userId
    );

    if (client) {
      io.to(client.socketId).emit(event, data);
    }
  } catch (err) {
    console.error(`Failed to emit to user ${userId}:`, err);
  }
}