// =========================================================
// device.repository.ts
// Path: src/modules/device/device.repository.ts
// =========================================================
// Raw SQL for device registration and management.
// The device-mode operations (activate/exit) stay in
// device-mode.repository.ts — this file only handles
// the CRUD lifecycle of the device record itself.
// =========================================================

import { pool }              from '../../db/pool.js';
import { ShopDevice, RegisterDeviceInput } from './device.types.js';

export class DeviceRepository {

  // ── Register (upsert) ────────────────────────────────────
  // Called when a tablet sends X-Device-Key for the first
  // time. Uses INSERT ... ON CONFLICT DO NOTHING so a second
  // call with the same key is safe and idempotent.
  //
  // Why ON CONFLICT DO NOTHING instead of DO UPDATE?
  //   We never want registration to reset an APPROVED device
  //   back to PENDING or overwrite the device_name an owner
  //   has set. If the key already exists, we just return it.
 static async registerDevice(input: RegisterDeviceInput): Promise<{ device: ShopDevice; isNew: boolean }> {
  const insertResult = await pool.query(
    `
    INSERT INTO shop_devices
      (shop_id, device_key, device_name, user_agent, ip_address, status)
    VALUES ($1, $2, $3, $4, $5::inet, 'PENDING')
    ON CONFLICT (device_key) DO NOTHING
    RETURNING id
    `,
    [input.shopId, input.deviceKey, input.deviceName, input.userAgent, input.ipAddress]
  );

  const isNew = (insertResult.rowCount ?? 0) > 0;

  const { rows } = await pool.query<ShopDevice>(
    `SELECT * FROM shop_devices WHERE device_key = $1`,
    [input.deviceKey]
  );

  return { device: rows[0], isNew };
}

  // ── Find all devices for a shop ──────────────────────────
  // Returns all statuses so the owner can see PENDING ones
  // that are waiting for approval.
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

  // ── Find one device by ID, scoped to a shop ──────────────
  static async findById(
    deviceId: string,
    shopId: string
  ): Promise<ShopDevice | null> {
    const { rows } = await pool.query<ShopDevice>(
      `
      SELECT *
      FROM shop_devices
      WHERE id = $1 AND shop_id = $2
      `,
      [deviceId, shopId]
    );
    return rows[0] ?? null;
  }

  // ── Approve a device ─────────────────────────────────────
  // Sets status = APPROVED and records who approved it.
  // Only works on PENDING devices — you cannot re-approve
  // an already-approved device (caller checks this).
  static async approveDevice(
    deviceId: string,
    shopId: string,
    approvedBy: string
  ): Promise<ShopDevice | null> {
    const { rows } = await pool.query<ShopDevice>(
      `
      UPDATE shop_devices
      SET status      = 'APPROVED',
          approved_by = $3
      WHERE id      = $1
        AND shop_id = $2
        AND status  = 'PENDING'
      RETURNING *
      `,
      [deviceId, shopId, approvedBy]
    );
    return rows[0] ?? null;
  }

  // ── Revoke a device ──────────────────────────────────────
  // Sets status = REVOKED. The device can no longer use
  // the system. requireApprovedDevice middleware blocks it.
  // We keep the record so the owner has an audit trail.
  static async revokeDevice(
    deviceId: string,
    shopId: string
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
  // Owner gives the device a friendly name so the pending
  // list shows "iPad Counter 1" instead of a raw UUID key.
  static async renameDevice(
    deviceId: string,
    shopId: string,
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
  // Hard delete — only allowed on REVOKED devices so we
  // never accidentally delete an active device.
  static async deleteDevice(
    deviceId: string,
    shopId: string
  ): Promise<boolean> {
    const result = await pool.query(
      `
      DELETE FROM shop_devices
      WHERE id      = $1
        AND shop_id = $2
        AND status  = 'REVOKED'
      `,
      [deviceId, shopId]
    );
    return (result.rowCount ?? 0) > 0;
  }
}