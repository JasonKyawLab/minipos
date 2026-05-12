// Path: backend/src/modules/terminal/terminal.repository.ts
// Purpose: All raw SQL for terminal session management.
// No business logic here — just database operations.

import { pool } from '../../db/pool.js';
import { TerminalSession } from './terminal.types.js';

export class TerminalRepository {

  // ── Create a new terminal session ────────────────────────
  // Called when owner/manager activates a terminal.
  // The session_token goes into the HttpOnly cookie.
  // access_token is destroyed by the controller after this.
  static async createSession(params: {
    shopId:          string;
    deviceId:        string | null;
    sessionToken:    string;
    mode:            string;
    authorizedBy:    string;
    authMethod:      string;
    emergencyCodeId: string | null;
    expiresAt:       Date | null;
  }): Promise<TerminalSession> {
    const { rows } = await pool.query<TerminalSession>(
      `
      INSERT INTO terminal_sessions (
        shop_id, device_id, session_token, mode,
        authorized_by, auth_method, emergency_code_id, expires_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
      `,
      [
        params.shopId,
        params.deviceId,
        params.sessionToken,
        params.mode,
        params.authorizedBy,
        params.authMethod,
        params.emergencyCodeId,
        params.expiresAt,
      ]
    );
    return rows[0];
  }

  // ── Find and validate a session by token ─────────────────
  // This is called on EVERY terminal API request.
  // The query is intentionally strict:
  //   - is_revoked = FALSE
  //   - Not expired (expires_at IS NULL OR expires_at > now())
  // A single index covers this lookup in O(1).
  static async findActiveSession(
    sessionToken: string
  ): Promise<TerminalSession | null> {
    const { rows } = await pool.query<TerminalSession>(
      `
      SELECT *
      FROM terminal_sessions
      WHERE session_token = $1
        AND is_revoked    = FALSE
        AND (expires_at IS NULL OR expires_at > now())
      `,
      [sessionToken]
    );
    return rows[0] ?? null;
  }

  // ── Touch last_seen_at (heartbeat) ────────────────────────
  // Called by middleware after every successful auth.
  // Fire-and-forget (no await needed in most cases).
  // AUDIT CHECKLIST: This must be called on every request.
  static async touchSession(sessionId: string): Promise<void> {
    await pool.query(
      `UPDATE terminal_sessions SET last_seen_at = now() WHERE id = $1`,
      [sessionId]
    );
  }

  // ── Revoke a session (Remote Kill Switch) ────────────────
  // Sets is_revoked = TRUE. The session stays in DB for audit.
  // The middleware will reject the token on the next request.
  static async revokeSession(params: {
    sessionId: string;
    revokedBy: string;
  }): Promise<boolean> {
    const result = await pool.query(
      `
      UPDATE terminal_sessions
      SET is_revoked = TRUE,
          revoked_by = $2,
          revoked_at = now()
      WHERE id         = $1
        AND is_revoked = FALSE
      `,
      [params.sessionId, params.revokedBy]
    );
    return (result.rowCount ?? 0) > 0;
  }

  // ── Delete a session (clean exit) ────────────────────────
  // Hard delete on clean exit. Differs from revoke because:
  //   - Revoke: owner remotely kills a running terminal
  //   - Delete: terminal exits cleanly via the normal flow
  // Both result in the terminal being dead; audit trail differs.
  static async deleteSession(sessionToken: string): Promise<boolean> {
    const result = await pool.query(
      `DELETE FROM terminal_sessions WHERE session_token = $1`,
      [sessionToken]
    );
    return (result.rowCount ?? 0) > 0;
  }

  // ── List active sessions for a shop (dashboard view) ─────
  static async findActiveSessionsForShop(shopId: string) {
    const { rows } = await pool.query(
      `
      SELECT
        ts.id,
        ts.mode,
        ts.auth_method,
        ts.last_seen_at,
        ts.expires_at,
        ts.created_at,
        u.name        AS authorized_by_name,
        sd.device_name
      FROM terminal_sessions ts
      JOIN users       u  ON u.id  = ts.authorized_by
      LEFT JOIN shop_devices sd ON sd.id = ts.device_id
      WHERE ts.shop_id   = $1
        AND ts.is_revoked = FALSE
        AND (ts.expires_at IS NULL OR ts.expires_at > now())
      ORDER BY ts.last_seen_at DESC
      `,
      [shopId]
    );
    return rows;
  }

  // ── Emergency codes ───────────────────────────────────────

  static async createEmergencyCode(params: {
    shopId:      string;
    codeHash:    string;
    mode:        string;
    generatedBy: string;
  }) {
    const { rows } = await pool.query(
      `
      INSERT INTO emergency_codes (shop_id, code_hash, mode, generated_by)
      VALUES ($1, $2, $3, $4)
      RETURNING *
      `,
      [params.shopId, params.codeHash, params.mode, params.generatedBy]
    );
    return rows[0];
  }

  // Find a valid (unused, unexpired) emergency code for this shop+mode.
  // We fetch it for verification — bcrypt comparison happens in the service.
  static async findPendingCode(shopId: string, mode: string) {
    const { rows } = await pool.query(
      `
      SELECT *
      FROM emergency_codes
      WHERE shop_id   = $1
        AND mode      = $2
        AND used_at   IS NULL
        AND expires_at > now()
      ORDER BY generated_at DESC
      LIMIT 1
      `,
      [shopId, mode]
    );
    return rows[0] ?? null;
  }

  // Mark a code as used (single-use enforcement)
  static async markCodeUsed(params: {
    codeId:    string;
    usedBy:    string;
    sessionId: string;
  }): Promise<void> {
    await pool.query(
      `
      UPDATE emergency_codes
      SET used_at             = now(),
          used_by             = $2,
          terminal_session_id = $3
      WHERE id = $1
      `,
      [params.codeId, params.usedBy, params.sessionId]
    );
  }
}