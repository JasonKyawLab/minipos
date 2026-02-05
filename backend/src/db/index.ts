import pkg from "pg";
const { Pool } = pkg;

export const pool = new Pool({
  host: "localhost",
  port: 5432,
  user: "minipos",
  password: "minipos",
  database: "minipos",
});