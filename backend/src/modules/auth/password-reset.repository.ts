import db from "../../db/pool.js";
import crypto from "crypto";

export class PasswordResetRepository {
  static async createToken(userId: string): Promise<string> {
    const token     = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    // Invalidate any existing unused tokens for this user
    await db.query(
      `UPDATE password_reset_tokens SET used = true WHERE user_id = $1 AND used = false`,
      [userId]
    );

    await db.query(
      `INSERT INTO password_reset_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)`,
      [userId, token, expiresAt]
    );

    return token;
  }

  static async findValidToken(token: string) {
    const res = await db.query(
      `SELECT * FROM password_reset_tokens
       WHERE token = $1 AND used = false AND expires_at > now()`,
      [token]
    );
    return res.rows[0] ?? null;
  }

  static async markUsed(token: string) {
    await db.query(
      `UPDATE password_reset_tokens SET used = true WHERE token = $1`,
      [token]
    );
  }
}
