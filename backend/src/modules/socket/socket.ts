// =========================================================
// socket.ts
// Path: backend/src/modules/socket/socket.ts
//
// CHANGES:
//   1. Terminal socket auth: terminals authenticate via the
//      terminal_session cookie (not access_token).
//      On connect, if terminal_session is valid, we
//      auto-join room: terminal:<shopId>:<mode>
//      This room is what force-logout events target.
//
//   2. New emitters:
//      emitToTerminalRoom(shopId, mode, event, data)
//      emitToPosTerminals(shopId, event, data)  -- convenience
//      emitToKitchenTerminals(shopId, event, data) -- convenience
//
//   3. join_qr_session and join_shop remain unchanged.
//
// WHY terminal:<shopId>:<mode> as the room name?
//   - Namespaced: prevents cross-shop or cross-mode leakage
//   - POS force-logout only targets terminal:<shopId>:POS
//   - Kitchen force-logout only targets terminal:<shopId>:KITCHEN
//   - Even if a room name leaked, it only receives the event
//     it is subscribed to — no sensitive data is exposed
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
// Socket.IO gives us the raw Cookie header — we parse it
// manually here instead of adding another dependency.
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
// Returns the session row if valid, null otherwise.
// This mirrors what attachTerminalSession HTTP middleware does.
async function validateTerminalSession(sessionToken: string) {
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
  // Three connection types:
  //   1. TERMINAL — has terminal_session cookie (no access_token needed)
  //   2. PLATFORM — has access_token cookie
  //   3. GUEST    — has neither (QR customer)
  //
  // We resolve the type here once and store on socket.data
  // so individual event handlers don't repeat the DB lookup.
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
      // Terminal cookie present but invalid — still allow as guest
      // so the page can render; the terminal will get 401 on next API call
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
    // If this is a terminal connection, immediately join the
    // terminal-specific room. The frontend does NOT need to
    // emit join_terminal_session manually — it happens here.
    //
    // Room name: terminal:<shopId>:<mode>
    // Examples:
    //   terminal:abc-123:POS
    //   terminal:abc-123:KITCHEN
    if (connectionType === "TERMINAL") {
      const { terminalShopId, terminalMode } = socket.data;
      const roomName = `terminal:${terminalShopId}:${terminalMode}`;
      socket.join(roomName);
      console.log(`[Socket][${requestId}] Terminal joined ${roomName}`);
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
    // Payload: { orderId: string }
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

/** Emit to all platform users in a shop room (dashboard). */
export function emitToShop(shopId: string, event: string, data: any): void {
  try {
    if (!io) return;
    io.to(`shop:${shopId}`).emit(event, data);
  } catch (err) {
    console.error(`Failed to emit to shop ${shopId}:`, err);
  }
}

/**
 * Emit to all terminals of a specific mode for a shop.
 * Room name: terminal:<shopId>:<mode>
 *
 * WHY this is the correct target for force-logout:
 *   - Only terminals in this exact shop+mode receive the event
 *   - No platform user or QR customer is in this room
 *   - The terminal joined this room automatically on connect
 *     by presenting a valid terminal_session cookie
 */
export function emitToTerminalRoom(
  shopId: string,
  mode:   "POS" | "KITCHEN",
  event:  string,
  data:   any
): void {
  try {
    if (!io) return;
    io.to(`terminal:${shopId}:${mode}`).emit(event, data);
  } catch (err) {
    console.error(`Failed to emit to terminal:${shopId}:${mode}:`, err);
  }
}

/** Convenience: emit to all POS terminals for a shop. */
export function emitToPosTerminals(shopId: string, event: string, data: any): void {
  emitToTerminalRoom(shopId, "POS", event, data);
}

/** Convenience: emit to all Kitchen terminals for a shop. */
export function emitToKitchenTerminals(shopId: string, event: string, data: any): void {
  emitToTerminalRoom(shopId, "KITCHEN", event, data);
}

/** Emit to a QR customer's order status room. */
export function emitToQrSession(orderId: string, event: string, data: any): void {
  try {
    if (!io) return;
    io.to(`qr_session:${orderId}`).emit(event, data);
  } catch (err) {
    console.error(`Failed to emit to qr_session ${orderId}:`, err);
  }
}

/** Emit to a single user's socket by userId. */
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