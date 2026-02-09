/**
 	•	SQL queries
 */
import { db } from "../../db/queries.js";
import { User } from "./user.model.js";

export class UserRepository {

static async create(user: Partial<User>) {
  const result = await db.query(
    `
    INSERT INTO users (name, email, password_hash, role, status)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING *
    `,
    [
      user.name,
      user.email,
      user.password_hash,
      user.role,
      user.status ?? "ACTIVE",
    ]
  );

  return result.rows[0];
}

  static async findByEmail(email: string) {
    const result = await db.query(
      `SELECT * FROM users WHERE email = $1`,
      [email]
    );
    return result.rows[0];
  }
}