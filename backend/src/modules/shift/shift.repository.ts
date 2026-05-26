// =========================================================
// src/modules/shift/shift.repository.ts
//
// Raw SQL only. No business logic.
// All joins and computed columns are handled directly here.
// =========================================================

import { pool } from "../../db/pool.js";

export interface ShiftRecord {
  session_id:         string;
  shop_id:            string;
  device_id:          string| null;
  user_id:            string;
  staff_name:         string;
  shop_role:          string;
  mode_type:          "POS" | "KITCHEN";
  login_at:           Date;
  logout_at:          Date | null;
  logout_reason:      string | null;
  duration_minutes:   number | null;
  duration_formatted: string;
  is_active:          boolean;
  device_name:        string | null;
}

export interface ShiftSummaryStats {
  total_shifts:           number;
  total_minutes_worked:   number;
  average_shift_minutes:  number;
  pos_shifts:             number;
  kitchen_shifts:         number;
}

// ── Shared Base Query ────────────────────────────────────
// Uses 'shop_users' as defined in your provided schema.
const SHIFT_BASE_QUERY = `
  SELECT
    sms.id                                          AS session_id,
    sms.shop_id,
    sms.device_id,
    sms.user_id,
    u.name                                          AS staff_name,
    su.role                                         AS shop_role,
    sms.mode_type,
    sms.login_at,
    sms.logout_at,
    sms.logout_reason,
    CASE
      WHEN sms.logout_at IS NOT NULL
      THEN EXTRACT(EPOCH FROM (sms.logout_at - sms.login_at)) / 60
      ELSE NULL
    END::INTEGER                                    AS duration_minutes,
    CASE
      WHEN sms.logout_at IS NULL
        THEN 'Active'
      WHEN EXTRACT(EPOCH FROM (sms.logout_at - sms.login_at)) / 3600 >= 1
        THEN CONCAT(
          FLOOR(EXTRACT(EPOCH FROM (sms.logout_at - sms.login_at)) / 3600)::INTEGER,
          'h ',
          (FLOOR(EXTRACT(EPOCH FROM (sms.logout_at - sms.login_at)) / 60) % 60)::INTEGER,
          'm'
        )
      ELSE CONCAT(
        FLOOR(EXTRACT(EPOCH FROM (sms.logout_at - sms.login_at)) / 60)::INTEGER,
        'm'
      )
    END                                             AS duration_formatted,
    (sms.logout_at IS NULL)                         AS is_active,
    sd.device_name,
    sms.created_at
  FROM staff_mode_sessions sms
  JOIN users u ON u.id = sms.user_id
  LEFT JOIN shop_users su ON su.user_id = sms.user_id AND su.shop_id = sms.shop_id
  LEFT JOIN shop_devices sd ON sd.id = sms.device_id
`;

export class ShiftRepository {

  static async findShiftsForShop(params: {
    shopId:   string;
    from?:    string;
    to?:      string;
    userId?:  string;
    mode?:    "POS" | "KITCHEN";
    limit:    number;
    offset:   number;
  }): Promise<ShiftRecord[]> {
    const conditions: string[] = ["sms.shop_id = $1"];
    const values: unknown[]   = [params.shopId];
    let   idx                 = 2;

    if (params.from) {
      conditions.push(`sms.login_at >= $${idx++}::timestamptz`);
      values.push(params.from);
    }
    if (params.to) {
      // Ensure the end date is inclusive by adding a 1-day interval
      conditions.push(`sms.login_at < ($${idx++}::DATE + INTERVAL '1 day')::timestamptz`);
      values.push(params.to);
    }
    if (params.userId) {
      conditions.push(`sms.user_id = $${idx++}`);
      values.push(params.userId);
    }
    if (params.mode) {
      conditions.push(`sms.mode_type = $${idx++}`);
      values.push(params.mode);
    }

    const limitIdx = idx++;
    const offsetIdx = idx++;
    values.push(params.limit);
    values.push(params.offset);

    const { rows } = await pool.query<ShiftRecord>(
      `
      ${SHIFT_BASE_QUERY}
      WHERE ${conditions.join(" AND ")}
      ORDER BY sms.login_at DESC
      LIMIT $${limitIdx} OFFSET $${offsetIdx}
      `,
      values
    );

    return rows;
  }

  static async countShiftsForShop(params: {
    shopId:  string;
    from?:   string;
    to?:     string;
    userId?: string;
    mode?:   "POS" | "KITCHEN";
  }): Promise<number> {
    const conditions: string[] = ["shop_id = $1"];
    const values: unknown[]   = [params.shopId];
    let   idx                 = 2;

    if (params.from) {
      conditions.push(`login_at >= $${idx++}::timestamptz`);
      values.push(params.from);
    }
    if (params.to) {
      conditions.push(`login_at < ($${idx++}::DATE + INTERVAL '1 day')::timestamptz`);
      values.push(params.to);
    }
    if (params.userId) {
      conditions.push(`user_id = $${idx++}`);
      values.push(params.userId);
    }
    if (params.mode) {
      conditions.push(`mode_type = $${idx++}`);
      values.push(params.mode);
    }

    const { rows } = await pool.query(
      `
      SELECT COUNT(*) AS total
      FROM staff_mode_sessions
      WHERE ${conditions.join(" AND ")}
      `,
      values
    );

    return parseInt(rows[0].total);
  }

  static async findShiftsForUser(params: {
    shopId:  string;
    userId:  string;
    from?:   string;
    to?:     string;
    limit:   number;
    offset:  number;
  }): Promise<ShiftRecord[]> {
    const conditions: string[] = ["sms.shop_id = $1", "sms.user_id = $2"];
    const values: unknown[] = [params.shopId, params.userId];
    let   idx               = 3;

    if (params.from) {
      conditions.push(`sms.login_at >= $${idx++}::timestamptz`);
      values.push(params.from);
    }
    if (params.to) {
      conditions.push(`sms.login_at < ($${idx++}::DATE + INTERVAL '1 day')::timestamptz`);
      values.push(params.to);
    }

    const limitIdx = idx++;
    const offsetIdx = idx++;
    values.push(params.limit);
    values.push(params.offset);

    const { rows } = await pool.query<ShiftRecord>(
      `
      ${SHIFT_BASE_QUERY}
      WHERE ${conditions.join(" AND ")}
      ORDER BY sms.login_at DESC
      LIMIT $${limitIdx} OFFSET $${offsetIdx}
      `,
      values
    );

    return rows;
  }

  static async getStaffShiftStats(params: {
    shopId: string;
    userId: string;
    from?:  string;
    to?:    string;
  }): Promise<ShiftSummaryStats> {
    const conditions: string[] = ["shop_id = $1", "user_id = $2", "logout_at IS NOT NULL"];
    const values: unknown[] = [params.shopId, params.userId];
    let   idx               = 3;

    if (params.from) {
      conditions.push(`login_at >= $${idx++}::timestamptz`);
      values.push(params.from);
    }
    if (params.to) {
      conditions.push(`login_at < ($${idx++}::DATE + INTERVAL '1 day')::timestamptz`);
      values.push(params.to);
    }

    const { rows } = await pool.query(
      `
      SELECT
        COUNT(*)::INTEGER                                                          AS total_shifts,
        COALESCE(SUM(EXTRACT(EPOCH FROM (logout_at - login_at)) / 60), 0)::INTEGER AS total_minutes_worked,
        COALESCE(AVG(EXTRACT(EPOCH FROM (logout_at - login_at)) / 60), 0)::INTEGER AS average_shift_minutes,
        COUNT(*) FILTER (WHERE mode_type = 'POS')::INTEGER                         AS pos_shifts,
        COUNT(*) FILTER (WHERE mode_type = 'KITCHEN')::INTEGER                     AS kitchen_shifts
      FROM staff_mode_sessions
      WHERE ${conditions.join(" AND ")}
      `,
      values
    );

    return rows[0];
  }

  static async getActiveStaffForShop(shopId: string) {
    const { rows } = await pool.query(
      `
      SELECT DISTINCT
        su.user_id,
        u.name,
        su.role
      FROM shop_users su
      JOIN users u ON u.id = su.user_id
      WHERE su.shop_id = $1
        AND u.is_deleted = false
      ORDER BY u.name ASC
      `,
      [shopId]
    );
    return rows;
  }
}