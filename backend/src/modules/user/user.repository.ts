import { db } from "../../db/queries.js";
import { appError } from "../../utils/appError.js";
import { User } from "./user.model.js";

export class UserRepository {

  static async create(data: {
    name: string;
    email: string;
    password_hash: string;
    role: "ADMIN" | "USER";
  }) {
    const res = await db.query(
      `
      INSERT INTO users (name, email, password_hash, role)
      VALUES ($1, $2, $3, $4)
      RETURNING *
      `,
      [data.name, data.email.toLowerCase(), data.password_hash, data.role]
    );
    return res.rows[0];
  }

  static async findById(userId: string): Promise<User | null> {
    const res = await db.query(
      `SELECT * FROM users WHERE id = $1 AND is_deleted = false`,
      [userId]
    );
    return res.rows[0] ?? null;
  }

  static async findByEmail(email: string): Promise<User | null> {
    const res = await db.query(
      `
      SELECT *
      FROM users
      WHERE email = $1
        AND is_deleted = false
        AND status = 'ACTIVE'
      `,
      [email.toLowerCase()]
    );
    return res.rows[0] ?? null;
  }

  static async findByEmailIncludeDeleted(email: string): Promise<User | null> {
    const res = await db.query(
      `
      SELECT *
      FROM users
      WHERE email = $1
      `,
      [email.toLowerCase()]
    );
    return res.rows[0] ?? null;
  }

  static async updateProfile(
    userId: string,
    data: { name?: string; email?: string }
  ): Promise<User> {
    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (data.name) {
      fields.push(`name = $${idx++}`);
      values.push(data.name);
    }

    if (data.email) {
      fields.push(`email = $${idx++}`);
      values.push(data.email.toLowerCase());
    }

    if (fields.length === 0) {
      throw new appError("NOTHING_TO_UPDATE", 400);
    }

    const res = await db.query(
      `
      UPDATE users
      SET ${fields.join(", ")},
          updated_at = now()
      WHERE id = $${idx}
        AND is_deleted = false
      RETURNING *
      `,
      [...values, userId]
    );

    return res.rows[0];
  }

  static async updatePassword(
    userId: string,
    passwordHash: string
  ): Promise<User> {
    const res = await db.query(
      `
      UPDATE users
      SET password_hash = $1,
          token_version = token_version + 1,
          updated_at = now()
      WHERE id = $2
        AND is_deleted = false
      RETURNING *
      `,
      [passwordHash, userId]
    );

    if (!res.rows[0]) {
      throw new appError("USER_NOT_FOUND", 404);
    }

    return res.rows[0];
  }

  static async softDelete(userId: string): Promise<void> {
    await db.query(
      `
      UPDATE users
      SET is_deleted = true,
          updated_at = now()
      WHERE id = $1
      `,
      [userId]
    );
  }

  static async activateUser(userId: string): Promise<User> {
    const res = await db.query(
      `
      UPDATE users
      SET 
        is_deleted = false,
        status = 'ACTIVE',
        updated_at = now()
      WHERE id = $1
      RETURNING *
      `,
      [userId]
    );
    return res.rows[0];
  }

  static async findMyShops(userId: string) {
    const res = await db.query(
      `
      SELECT
        s.id,
        s.name,
        s.shop_type,
        s.currency,
        s.timezone,
        su.role AS shop_role
      FROM shop_users su
      JOIN shops s ON s.id = su.shop_id
      WHERE su.user_id = $1
        AND su.is_active = true
        AND s.is_deleted = false
      `,
      [userId]
    );
    return res.rows;
  }

  static async incrementTokenVersion(userId: string): Promise<void> {
    await db.query(
      `
      UPDATE users
      SET token_version = token_version + 1,
          updated_at = now()
      WHERE id = $1
      `,
      [userId]
    );
  }
}