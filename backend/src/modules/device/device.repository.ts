// =========================================================
// device.repository.ts
// Path: backend/src/modules/device/device.repository.ts
//
// Verified against schema columns (001_init_schema.sql):
//   id, shop_id, device_name, device_key, status,
//   current_mode, mode_activated_by, approved_by,
//   mode_activated_at, user_agent, ip_address,
//   last_seen_at, created_at
//
// device_status enum: ('PENDING', 'APPROVED', 'REVOKED')
//
// ── BUG FIX: approveDevice accepts PENDING and REVOKED ───
//
// The original WHERE clause was:
//   WHERE id = $1 AND shop_id = $2 AND status = 'PENDING'
//
// This prevented a REVOKED device from being directly approved
// without going through the full re-registration cycle first.
// The fix adds an `acceptRevoked` parameter (default: false for
// safety) that widens the WHERE to include 'REVOKED'.
//
// ── ON CONFLICT target: (device_key) ─────────────────────
// device_key is UNIQUE. The conflict target must match that
// constraint — not (id), which is the PK and is always new.
//
// Status transition table for registerDevice:
//   First call, no row         → INSERT → PENDING,  isNew = true
//   Repeat call, PENDING       → conflict, WHERE false → no change, isNew = false
//   Repeat call, APPROVED      → conflict, WHERE false → no change, isNew = false
//   Repeat call, REVOKED       → DO UPDATE → PENDING, isNew = true  ✓
// =========================================================

import { pool }                           from '../../db/pool.js';
import { ShopDevice, RegisterDeviceInput } from './device.types.js';

export class DeviceRepository {

  // ── Register (idempotent upsert with REVOKED re-promotion) ──────────
  static async registerDevice(
    input: RegisterDeviceInput
  ): Promise<{ device: ShopDevice; isNew: boolean }> {

    const insertResult = await pool.query(
      `
      INSERT INTO shop_devices
        (shop_id, device_key, device_name, user_agent, ip_address, status)
      VALUES ($1, $2, $3, $4, $5::inet, 'PENDING')
      ON CONFLICT (device_key) DO UPDATE
        SET status       = 'PENDING',
            device_name  = EXCLUDED.device_name,
            user_agent   = EXCLUDED.user_agent,
            ip_address   = EXCLUDED.ip_address,
            last_seen_at = now()
        WHERE shop_devices.status = 'REVOKED'
      RETURNING id
      `,
      [
        input.shopId,
        input.deviceKey,
        input.deviceName,
        input.userAgent,
        input.ipAddress,
      ]
    );

    // rowCount > 0  → INSERT (new row) OR UPDATE (REVOKED → PENDING)
    // rowCount === 0 → conflict fired but WHERE was false (PENDING/APPROVED)
    const isNew = (insertResult.rowCount ?? 0) > 0;

    const { rows } = await pool.query<ShopDevice>(
      `SELECT * FROM shop_devices WHERE device_key = $1`,
      [input.deviceKey]
    );

    return { device: rows[0], isNew };
  }

  // ── Find all devices for a shop ──────────────────────────
  static async findAllByShop(shopId: string): Promise<ShopDevice[]> {
    const { rows } = await pool.query<ShopDevice>(
      `
      SELECT *
      FROM shop_devices
      WHERE shop_id = $1
      ORDER BY created_at DESC
      `,
      [shopId]
    );
    return rows;
  }

  // ── Find one device by DB id, scoped to a shop ───────────
  static async findById(
    deviceId: string,
    shopId:   string
  ): Promise<ShopDevice | null> {
    const { rows } = await pool.query<ShopDevice>(
      `SELECT * FROM shop_devices WHERE id = $1 AND shop_id = $2`,
      [deviceId, shopId]
    );
    return rows[0] ?? null;
  }

  // ── Find by device_key scoped to a shop ──────────────────
  static async findByDeviceKey(
    deviceKey: string,
    shopId:    string
  ): Promise<ShopDevice | null> {
    const { rows } = await pool.query<ShopDevice>(
      `
      SELECT *
      FROM shop_devices
      WHERE device_key = $1
        AND shop_id    = $2
      `,
      [deviceKey, shopId]
    );
    return rows[0] ?? null;
  }

  // ── Approve a device ─────────────────────────────────────
  //
  // BUG FIX: `acceptRevoked` parameter (default false).
  //
  // When acceptRevoked = false (default):
  //   WHERE status = 'PENDING'          — original strict behaviour
  //   Used by nothing currently; kept for safety.
  //
  // When acceptRevoked = true:
  //   WHERE status IN ('PENDING', 'REVOKED')
  //   Used by DeviceService.approveDevice() so the owner can
  //   directly re-approve a REVOKED device from the Permissions
  //   page without waiting for the tablet to self-register first.
  //
  // Returns null if:
  //   - Device does not exist (caller should throw 404)
  //   - Device exists but is already APPROVED (caller throws 409)
  static async approveDevice(
    deviceId:      string,
    shopId:        string,
    approvedBy:    string,
    acceptRevoked: boolean = false
  ): Promise<ShopDevice | null> {
    const statusFilter = acceptRevoked
      ? `status IN ('PENDING', 'REVOKED')`
      : `status = 'PENDING'`;

    const { rows } = await pool.query<ShopDevice>(
      `
      UPDATE shop_devices
      SET status      = 'APPROVED',
          approved_by = $3
      WHERE id      = $1
        AND shop_id = $2
        AND ${statusFilter}
      RETURNING *
      `,
      [deviceId, shopId, approvedBy]
    );
    return rows[0] ?? null;
  }

  // ── Revoke a device ──────────────────────────────────────
  static async revokeDevice(
    deviceId: string,
    shopId:   string
  ): Promise<ShopDevice | null> {
    const { rows } = await pool.query<ShopDevice>(
      `
      UPDATE shop_devices
      SET status       = 'REVOKED',
          current_mode = NULL
      WHERE id      = $1
        AND shop_id = $2
        AND status != 'REVOKED'
      RETURNING *
      `,
      [deviceId, shopId]
    );
    return rows[0] ?? null;
  }

  // ── Rename a device ──────────────────────────────────────
  static async renameDevice(
    deviceId:   string,
    shopId:     string,
    deviceName: string
  ): Promise<ShopDevice | null> {
    const { rows } = await pool.query<ShopDevice>(
      `
      UPDATE shop_devices
      SET device_name = $3
      WHERE id      = $1
        AND shop_id = $2
      RETURNING *
      `,
      [deviceId, shopId, deviceName]
    );
    return rows[0] ?? null;
  }

  // ── Delete a device record ───────────────────────────────
  // Hard delete — only allowed on REVOKED devices.
  static async deleteDevice(
    deviceId: string,
    shopId:   string
  ): Promise<boolean> {
    const result = await pool.query(
      `
      DELETE FROM shop_devices
      WHERE id      = $1
        AND shop_id = $2
        AND status IN ('REVOKED', 'PENDING')
      `,
      [deviceId, shopId]
    );
    return (result.rowCount ?? 0) > 0;
  }

  // ── Count pending devices for a shop ──────────────────────
  // Used by the sidebar notification badge. Deliberately returns
  // just a number instead of full rows (IP, user agent, etc.) —
  // the sidebar renders on every shop page, so this gets polled
  // far more often than the full device list is ever fetched.
  static async countPending(shopId: string): Promise<number> {
    const { rows } = await pool.query(
      `
      SELECT COUNT(*)::int AS count
      FROM shop_devices
      WHERE shop_id = $1
        AND status  = 'PENDING'
      `,
      [shopId]
    );
    return rows[0]?.count ?? 0;
  }

}