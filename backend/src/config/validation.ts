// =========================================================
// validation.ts
// Path: backend/src/config/validation.ts
// =========================================================
// Environment variables validation using Zod
// This ensures all required env vars are present before app starts
// =========================================================

import { z } from "zod";
import dotenv from "dotenv";

// Load environment variables from .env file
dotenv.config();

const envSchema = z.object({
  // Node environment
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  
  // Server
  PORT: z.coerce.number().default(3000),
  CLIENT_ORIGIN: z.string().url().default("http://localhost:3000"),
  
  // Database
  POSTGRES_HOST: z.string().default("postgres"),
  POSTGRES_PORT: z.coerce.number().default(5432),
  POSTGRES_USER: z.string(),
  POSTGRES_PASSWORD: z.string(),
  POSTGRES_DB: z.string(),
  
  // JWT
  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),
  
  // Socket.IO
  SOCKET_CORS_ORIGIN: z.string().url().optional(),
  
  // Rate limiting
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(15 * 60 * 1000), // 15 minutes
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().default(100),  // 100 requests per window

  // Strict limiting
  STRICT_LIMIT_WINDOW_MS: z.coerce.number().default(5 * 60 * 1000), // 5 minutes
  STRICT_LIMIT_MAX_REQUESTS: z.coerce.number().default(20), // 20 requests per 5 minutes

  // Login limiting
  LOGIN_LIMIT_WINDOW_MS: z.coerce.number().default(15 * 60 * 1000), // 15 minutes
  LOGIN_LIMIT_MAX_REQUESTS: z.coerce.number().default(5), // 5 failed attempts per 15 minutes

  // Refund limiting
  REFUND_LIMIT_WINDOW_MS: z.coerce.number().default(60 * 60 * 1000), // 1 hour
  REFUND_LIMIT_MAX_REQUESTS: z.coerce.number().default(10), // 10 refunds per hour

});

// Parse and validate
export const env = envSchema.parse(process.env);

// Type for environment variables
export type Env = typeof env;

// Helper to check if in production
export const isProduction = env.NODE_ENV === "production";
export const isDevelopment = env.NODE_ENV === "development";
export const isTest = env.NODE_ENV === "test";