import { Pool } from "pg";
import { env } from "../config/validation.js";


export const pool = new Pool({
  host: env.POSTGRES_HOST,
  port: env.POSTGRES_PORT,
  user: env.POSTGRES_USER,
  password: env.POSTGRES_PASSWORD,
  database: env.POSTGRES_DB,
});

pool.on("connect", () => {
  console.log("Database connected");
});

pool.on("error", (err) => {
  console.error("Unexpected database error:", err);
});

export async function checkDatabaseConnection(): Promise<boolean> {
  try {
    await pool.query("SELECT 1");
    return true;
  } catch {
    return false;
  }
}