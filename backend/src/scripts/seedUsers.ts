import bcrypt from "bcrypt";
import { pool } from "../db/pool.js";

async function seed() {
  const password = "123456";
  const passwordHash = await bcrypt.hash(password, 10);

  const users = [
    { name: "ADMIN", email: "admin@test.com", role: "ADMIN" },
    { name: "Owner", email: "owner@test.com", role: "USER"  },
  ];

  for (const user of users) {
    const result = await pool.query(
      `
      INSERT INTO users (name, email, password_hash, role)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT DO NOTHING
      RETURNING id, email, role
      `,
      [user.name, user.email, passwordHash, user.role]
    );

    if (result.rowCount === 0) {
      console.log(`⚠️  Already exists: ${user.email}`);
    } else {
      console.log(`✅ Created: ${user.email} (${user.role})`);
      console.log(result.rows[0]);
    }
  }

  process.exit(0);
}

seed().catch((err) => {
  console.error("❌ Seed failed:", err);
  process.exit(1);
});