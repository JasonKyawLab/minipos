// =========================================================
// socket.ts
// Path: backend/src/modules/socket/socket.ts
//
// CHANGES:
//   - Added "join_terminal_session" event for explicit room join.
//   - Debug logging for emitToTerminalRoom.
//   - Exported validateTerminalSession.
// =========================================================

import { Server, Socket } from "socket.io";
import { Server as HttpServer } from "http";
import jwt from "jsonwebtoken";
import { pool } from "../../db/pool.js";
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

// ── Cookie parser helper ──────────────────────────────────
function parseCookies(cookieHeader: string): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (!cookieHeader) return cookies;
  for (const part of cookieHeader.split(";")) {
    const [key, ...valueParts] = part.trim().split("=");
    if (key) cookies[key.trim()] = decodeURIComponent(valueParts.join("=").trim());
  }
  return cookies;
}

// ── Validate terminal_session cookie against DB ───────────
export async function validateTerminalSession(sessionToken: string) {
  const { rows } = await pool.query(
    `
    SELECT
      id,
      shop_id AS "shopId",
      mode,
      authorized_by AS "authorizedBy"
    FROM terminal_sessions
    WHERE session_token = $1
      AND is_revoked    = FALSE
      AND (expires_at IS NULL OR expires_at > now())
    `,
    [sessionToken]
  );
  return rows[0] ?? null;
}

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
  io.use(async (socket: Socket, next) => {
    const requestId = randomUUID();
    socket.data.requestId = requestId;

    const cookieHeader = socket.handshake.headers.cookie ?? "";
    const cookies = parseCookies(cookieHeader);

    // ── Priority 1: Terminal session ──────────────────────
    const terminalToken = cookies["terminal_session"];
    if (terminalToken) {
      try {
        const terminalSession = await validateTerminalSession(terminalToken);
        if (terminalSession) {
          socket.data.connectionType = "TERMINAL";
          socket.data.terminalShopId = terminalSession.shopId;
          socket.data.terminalMode   = terminalSession.mode;
          socket.data.authorizedBy   = terminalSession.authorizedBy;
          return next();
        }
      } catch (err) {
        console.error("[Socket] Terminal session validation error:", err);
      }
    }

    // ── Priority 2: Platform JWT ──────────────────────────
    const accessToken = cookies["access_token"];
    if (accessToken) {
      try {
        const decoded = jwt.verify(accessToken, env.JWT_SECRET!) as {
          userId: string;
          tokenVersion: number;
        };
        const user = await UserRepository.findById(decoded.userId);
        if (!user || user.is_deleted) return next(new Error("USER_NOT_FOUND"));
        if (user.token_version !== decoded.tokenVersion) return next(new Error("TOKEN_EXPIRED"));
        if (user.status !== "ACTIVE") return next(new Error("USER_NOT_ACTIVE"));

        socket.data.connectionType = "PLATFORM";
        socket.data.userId         = user.id;
        socket.data.userRole       = user.role;
        socket.data.userName       = user.name;
        socket.data.userEmail      = user.email;
        return next();
      } catch {
        // Fall through to GUEST
      }
    }

    // ── Priority 3: Guest (QR customer, no auth) ──────────
    socket.data.connectionType = "GUEST";
    return next();
  });

  // ── Connection handler ───────────────────────────────────
  io.on("connection", (socket: Socket) => {
    const requestId      = socket.data.requestId;
    const connectionType = socket.data.connectionType as "TERMINAL" | "PLATFORM" | "GUEST";

    // ── Auto-join terminal room ───────────────────────────
    if (connectionType === "TERMINAL") {
      const { terminalShopId, terminalMode } = socket.data;
      const roomName = `terminal:${terminalShopId}:${terminalMode}`;
      socket.join(roomName);
      console.log(`[Socket][${requestId}] Terminal auto-joined ${roomName}`);
      socket.emit("terminal_room_joined", { room: roomName, mode: terminalMode });
    }

    if (connectionType === "PLATFORM") {
      connectedClients.set(socket.id, {
        socketId: socket.id,
        userId:   socket.data.userId,
      });
      console.log(`[Socket][${requestId}] Platform user: ${socket.data.userEmail}`);
    }

    if (connectionType === "GUEST") {
      console.log(`[Socket][${requestId}] Guest connected`);
    }

    // =======================================================
    // EVENT: join_shop (platform users only)
    // =======================================================
    socket.on("join_shop", async (shopId: string) => {
      if (connectionType !== "PLATFORM") {
        socket.emit("error", { message: "PLATFORM_AUTH_REQUIRED" });
        return;
      }
      await handleJoinShop(socket, shopId);
    });

    // =======================================================
    // EVENT: join_qr_session (unauthenticated QR customers)
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
    // NEW: EVENT: join_terminal_session (explicit terminal join)
    // =======================================================
    socket.on("join_terminal_session", async ({ shopId, mode }: { shopId: string; mode: "POS" | "KITCHEN" }) => {
      // Only allow terminal connections
      if (connectionType !== "TERMINAL") {
        socket.emit("error", { message: "TERMINAL_AUTH_REQUIRED" });
        return;
      }

      // Re-validate the session from the cookie to be safe
      const cookieHeader = socket.handshake.headers.cookie ?? "";
      const cookies = parseCookies(cookieHeader);
      const sessionToken = cookies["terminal_session"];
      if (!sessionToken) {
        socket.emit("error", { message: "MISSING_TERMINAL_SESSION" });
        return;
      }

      try {
        const session = await validateTerminalSession(sessionToken);
        if (!session) {
          socket.emit("error", { message: "INVALID_SESSION" });
          return;
        }
        if (session.shopId !== shopId || session.mode !== mode) {
          socket.emit("error", { message: "SESSION_MISMATCH" });
          return;
        }

        const roomName = `terminal:${shopId}:${mode}`;
        socket.join(roomName);
        console.log(`[Socket][${requestId}] Manual join_terminal_session: ${roomName}`);
        socket.emit("terminal_room_joined", { room: roomName, mode });
      } catch (err) {
        console.error(`[Socket][${requestId}] join_terminal_session error:`, err);
        socket.emit("error", { message: "JOIN_FAILED" });
      }
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
        callback({ timestamp: Date.now(), connectionType });
      }
    });

    // =======================================================
    // EVENT: get_connected_users (admin dashboard only)
    // =======================================================
    socket.on("get_connected_users", async () => {
      if (connectionType !== "PLATFORM" || socket.data.userRole !== "ADMIN") {
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
      console.log(`[Socket][${requestId}] Disconnected (${connectionType})`);
    });

    socket.on("error", (error) => {
      console.error(`[Socket][${requestId}] Socket error:`, error);
    });
  });

  return io;
}

// =========================================================
// HELPERS
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
// EMITTERS
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

export function emitToTerminalRoom(
  shopId: string,
  mode:   "POS" | "KITCHEN",
  event:  string,
  data:   any
): void {
  try {
    if (!io) return;
    const room = `terminal:${shopId}:${mode}`;
    console.log(`[Socket] Emitting ${event} to room ${room}`);
    io.to(room).emit(event, data);
  } catch (err) {
    console.error(`Failed to emit to terminal:${shopId}:${mode}:`, err);
  }
}

export function emitToPosTerminals(shopId: string, event: string, data: any): void {
  emitToTerminalRoom(shopId, "POS", event, data);
}

export function emitToKitchenTerminals(shopId: string, event: string, data: any): void {
  emitToTerminalRoom(shopId, "KITCHEN", event, data);
}

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
    initialized:      !!io,
    connectedClients: connectedClients.size,
  };
}