import bcrypt from "bcrypt";
import { pool } from "../db/pool.js";

async function seed() {
  const password = "123456";
  const passwordHash = await bcrypt.hash(password, 10);

  const result = await pool.query(
    `
    INSERT INTO users (name, email, password_hash, role)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT DO NOTHING
    RETURNING id, email
    `,
    ["manager", "manager@test.com", passwordHash, "OWNER"]
  );

  if (result.rowCount === 0) {
    console.log("⚠️  User already exists");
  } else {
    console.log("✅ User created successfully:");
    console.log(result.rows[0]);
  }

  process.exit(0);
}

seed().catch((err) => {
  console.error("❌ Seed failed:", err);
  process.exit(1);
});