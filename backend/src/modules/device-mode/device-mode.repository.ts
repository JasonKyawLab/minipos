import { pool } from '../../db/pool.js';
import { DeviceMode, LogoutReason, StaffModeSession } from './device-mode.types.js';

export class DeviceModeRepository {

  // ── Activate mode on a device ─────────────────────────
  // Sets current_mode on shop_devices.
  // Called after owner enters password to lock the tablet.
  static async activateMode(params: {
    deviceId:      string;
    shopId:        string;
    mode:          DeviceMode;
    activatedBy:   string;
  }): Promise<boolean> {
    const result = await pool.query(
      `
      UPDATE shop_devices
      SET current_mode      = $3::device_mode,
          mode_activated_by = $4,
          mode_activated_at = now()
      WHERE id      = $1
        AND shop_id = $2
        AND status  = 'APPROVED'
      `,
      [params.deviceId, params.shopId, params.mode, params.activatedBy]
    );
    return (result.rowCount ?? 0) > 0;
  }

// ── Close all active staff sessions on terminal exit ──────
  // Used by TerminalService.exitTerminal() — when a terminal
  // device exits POS/Kitchen mode, every staff member currently
  // clocked in on it must be force-logged-out so they don't
  // appear "active" forever on a torn-down terminal.
  //
  // Falls back to closing by shop_id + mode_type when the
  // session has no device_id (edge case: device never registered).
  static async closeSessionsOnTerminalExit(params: {
    shopId:   string;
    deviceId: string | null;
    mode:     string;
  }): Promise<void> {
    if (params.deviceId) {
      await pool.query(
        `
        UPDATE staff_mode_sessions
        SET logout_at     = now(),
            logout_reason = 'MODE_EXIT'
        WHERE device_id = $1
          AND logout_at IS NULL
        `,
        [params.deviceId]
      );
    } else {
      await pool.query(
        `
        UPDATE staff_mode_sessions
        SET logout_at     = now(),
            logout_reason = 'MODE_EXIT'
        WHERE shop_id   = $1
          AND mode_type = $2
          AND logout_at IS NULL
        `,
        [params.shopId, params.mode]
      );
    }
  }
  
  // ── Exit mode on a device ─────────────────────────────
  // Clears current_mode. Done atomically with closing all
  // active staff sessions for this device.
  static async exitMode(params: {
    deviceId:  string;
    shopId:    string;
    exitedBy:  string;
  }): Promise<boolean> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // 1. Close all active staff PIN sessions on this device
      await client.query(
        `
        UPDATE staff_mode_sessions
        SET logout_at     = now(),
            logout_reason = 'MODE_EXIT'
        WHERE device_id  = $1
          AND logout_at IS NULL
        `,
        [params.deviceId]
      );

      // 2. Clear the mode from the device
      const result = await client.query(
        `
        UPDATE shop_devices
        SET current_mode      = NULL,
            mode_activated_by = NULL,
            mode_activated_at = NULL
        WHERE id      = $1
          AND shop_id = $2
        `,
        [params.deviceId, params.shopId]
      );

      await client.query('COMMIT');
      return (result.rowCount ?? 0) > 0;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  // ── Get current device mode status ───────────────────
  static async getDeviceMode(deviceId: string, shopId: string) {
    const { rows } = await pool.query(
      `
      SELECT
        id,
        device_name,
        current_mode,
        mode_activated_by,
        mode_activated_at,
        status
      FROM shop_devices
      WHERE id      = $1
        AND shop_id = $2
      `,
      [deviceId, shopId]
    );
    return rows[0] ?? null;
  }

  // ── Record staff PIN login ────────────────────────────
  // Called after a successful PIN login inside a mode.
  // If the staff member is already active on this device,
  // close their previous session first (handles missed logouts).
  static async recordStaffLogin(params: {
  shopId:   string;
  deviceId: string | null;   // CHANGED: was 'string', now nullable
  userId:   string;
  mode:     DeviceMode;
}): Promise<StaffModeSession> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    if (params.deviceId) {
      // Device known: close any existing session on this specific device
      await client.query(
        `
        UPDATE staff_mode_sessions
        SET logout_at     = now(),
            logout_reason = 'SELF'
        WHERE device_id = $1
          AND user_id   = $2
          AND logout_at IS NULL
        `,
        [params.deviceId, params.userId]
      );
    } else {
      // No device_id: close any active session for this user in this shop.
      // This prevents duplicate open sessions when a user logs in from
      // a terminal we cannot identify by hardware.
      await client.query(
        `
        UPDATE staff_mode_sessions
        SET logout_at     = now(),
            logout_reason = 'SELF'
        WHERE shop_id  = $1
          AND user_id  = $2
          AND logout_at IS NULL
        `,
        [params.shopId, params.userId]
      );
    }

    // Insert the new session.
    // device_id is stored as NULL when not available — this is
    // expected and the shift.repository LEFT JOIN handles it correctly.
    const result = await client.query<StaffModeSession>(
      `
      INSERT INTO staff_mode_sessions
        (shop_id, device_id, user_id, mode_type)
      VALUES ($1, $2, $3, $4::device_mode)
      RETURNING *
      `,
      [params.shopId, params.deviceId, params.userId, params.mode]
    );

    await client.query('COMMIT');
    return result.rows[0];
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

  // ── Record staff PIN logout ───────────────────────────
  static async recordStaffLogout(params: {
    deviceId: string;
    userId:   string;
    reason:   LogoutReason;
  }): Promise<boolean> {
    const result = await pool.query(
      `
      UPDATE staff_mode_sessions
      SET logout_at     = now(),
          logout_reason = $3
      WHERE device_id = $1
        AND user_id   = $2
        AND logout_at IS NULL
      `,
      [params.deviceId, params.userId, params.reason]
    );
    return (result.rowCount ?? 0) > 0;
  }

  // ── Get staff activity for a device ──────────────────
  // Returns the login/logout history for a device.
  // Useful for the owner to audit who used the tablet.
  static async getStaffActivity(params: {
    deviceId: string;
    shopId:   string;
    limit:    number;
    offset:   number;
  }) {
    const { rows } = await pool.query(
      `
      SELECT
        sms.id,
        sms.user_id,
        u.name              AS staff_name,
        su.role             AS shop_role,
        sms.mode_type,
        sms.login_at,
        sms.logout_at,
        sms.logout_reason,
        (sms.logout_at IS NULL) AS is_currently_active
      FROM staff_mode_sessions sms
      JOIN users      u  ON u.id  = sms.user_id
      JOIN shop_users su ON su.user_id = sms.user_id
                        AND su.shop_id = sms.shop_id
      WHERE sms.device_id = $1
        AND sms.shop_id   = $2
      ORDER BY sms.login_at DESC
      LIMIT  $3
      OFFSET $4
      `,
      [params.deviceId, params.shopId, params.limit, params.offset]
    );
    return rows;
  }
}