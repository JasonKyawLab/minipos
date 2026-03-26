// =========================================================
// env.ts
// Path: backend/src/config/env.ts
// =========================================================
// Minimal environment validation - checks required variables
// and provides typed access to all env vars
// =========================================================

import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

// Load .env from project root
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, "../../../.env") });

// ── Required variables (app won't start without these) ──
const REQUIRED_ENV_VARS = [
  "JWT_SECRET",
  "POSTGRES_USER",
  "POSTGRES_PASSWORD",
  "POSTGRES_DB",
] as const;

// Check required variables
for (const key of REQUIRED_ENV_VARS) {
  if (!process.env[key]) {
    console.error(`❌ Missing required environment variable: ${key}`);
    console.error(`   Please add it to your .env file`);
    process.exit(1);
  }
}

// ── Validate JWT_SECRET length (minimum 32 chars for security) ──
if (process.env.JWT_SECRET && process.env.JWT_SECRET.length < 32) {
  console.warn(`⚠️  Warning: JWT_SECRET is only ${process.env.JWT_SECRET.length} characters long`);
  console.warn(`   For production, use at least 32 characters for security`);
}

// ── Export typed environment variables ────────────────────
export const env = {
  // Node environment
  NODE_ENV: process.env.NODE_ENV || "development",
  
  // Server
  PORT: parseInt(process.env.PORT || "3000"),
  BACKEND_PORT: parseInt(process.env.BACKEND_PORT || "3001"),
  
  // Frontend
  FRONTEND_PORT: parseInt(process.env.FRONTEND_PORT || "3000"),
  CLIENT_ORIGIN: process.env.CLIENT_ORIGIN || `http://localhost:${process.env.FRONTEND_PORT || "3000"}`,
  
  // Database
  POSTGRES_HOST: process.env.POSTGRES_HOST || "postgres",
  POSTGRES_PORT: parseInt(process.env.POSTGRES_PORT || "5432"),
  POSTGRES_USER: process.env.POSTGRES_USER!,
  POSTGRES_PASSWORD: process.env.POSTGRES_PASSWORD!,
  POSTGRES_DB: process.env.POSTGRES_DB!,
  
  // JWT
  JWT_SECRET: process.env.JWT_SECRET!,
  
  // Socket.IO
  SOCKET_CORS_ORIGIN: process.env.SOCKET_CORS_ORIGIN,
} as const;

// ── Type for environment variables ───────────────────────
export type Env = typeof env;

// ── Helper functions ─────────────────────────────────────
export const isProduction = env.NODE_ENV === "production";
export const isDevelopment = env.NODE_ENV === "development";
export const isTest = env.NODE_ENV === "test";