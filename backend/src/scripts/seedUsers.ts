import bcrypt from "bcrypt";
import { pool } from "../db/pool.js";

async function seed() {
  const password = "123456";
  const passwordHash = await bcrypt.hash(password, 10);

  await pool.query(
    `
    INSERT INTO users (name, email, password_hash, role)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (email) DO NOTHING
    `,
    ["Admin", "admin@test.com", passwordHash, "OWNER"]
  );

  console.log("✅ Admin user inserted");
  process.exit(0);
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});