import { db } from "../../db/queries.js";
import crypto from "crypto";

export class EmailVerificationRepository {
  static async createToken(userId: string): Promise<string> {
    const token     = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    await db.query(
      `UPDATE email_verification_tokens SET used = true WHERE user_id = $1 AND used = false`,
      [userId]
    );

    await db.query(
      `INSERT INTO email_verification_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)`,
      [userId, token, expiresAt]
    );

    return token;
  }

  static async findValidToken(token: string) {
    const res = await db.query(
      `SELECT * FROM email_verification_tokens
       WHERE token = $1 AND used = false AND expires_at > now()`,
      [token]
    );
    return res.rows[0] ?? null;
  }

  static async markUsed(token: string) {
    await db.query(
      `UPDATE email_verification_tokens SET used = true WHERE token = $1`,
      [token]
    );
  }

  static async markUserVerified(userId: string) {
    await db.query(
      `UPDATE users SET email_verified = true WHERE id = $1`,
      [userId]
    );
  }
}
