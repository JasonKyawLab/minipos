// We switch from app.listen() to http.createServer(app).
// This is required because Socket.IO needs the raw HTTP server,
// not the Express app. The behavior is identical for HTTP routes.

import http from "http";
import app from "./app.js";
import { initSocket } from "./modules/socket/socket.js";
import "dotenv/config"; 
import { env } from "./config/validation.js"; 

const PORT = env.PORT;

const httpServer = http.createServer(app);

// Initialize Socket.IO on the same server
initSocket(httpServer);

httpServer.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
  console.log(`Socket.IO ready for connections`);
});

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("SIGTERM received, closing server...");
  httpServer.close(() => {
    console.log("Server closed");
    process.exit(0);
  });
});