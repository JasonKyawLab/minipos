// =========================================================
// Reads the X-Device-Key header and attaches the device
// record to req.device.
//
// Why a separate middleware and not merged into requireAuth?
//   - Device auth is independent from user auth.
//   - A request can have both (owner logged in on an approved
//     device) or just one (device checking its own status).
//   - Keeping them separate follows single responsibility.
//
// Usage:
//   - Optional: attach device info if header present
//   - Required: enforce device must be APPROVED
// =========================================================

import { Request, Response, NextFunction } from 'express';
import { pool } from '../db/pool.js';

// Extend Express Request
declare global {
  namespace Express {
    interface Request {
      device?: {
        id:        string;
        shopId:    string;
        name:      string | null;
        status:    string;
        mode:      string | null;
      };
    }
  }
}

// Attach device to request if X-Device-Key header is present.
// Does NOT reject if header is missing — use requireApprovedDevice for that.
export async function attachDevice(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const deviceKey = req.headers['x-device-key'] as string | undefined;

  if (!deviceKey) {
    return next();
  }

  try {
    const { rows } = await pool.query(
      `
      SELECT
        id,
        shop_id    AS "shopId",
        device_name AS name,
        status,
        current_mode AS mode
      FROM shop_devices
      WHERE device_key = $1
      `,
      [deviceKey]
    );

    if (rows.length > 0) {
      req.device = rows[0];

      // Update last_seen_at on every authenticated request
      // Fire-and-forget — don't block the request on this
      pool.query(
        `UPDATE shop_devices SET last_seen_at = now() WHERE id = $1`,
        [rows[0].id]
      ).catch(err => console.error('Failed to update last_seen_at:', err));
    }

    next();
  } catch (err) {
    next(err);
  }
}

// Rejects the request if:
//   - No X-Device-Key header
//   - Device not found
//   - Device is not APPROVED
//   - Device does not belong to the shop in the URL param
export function requireApprovedDevice(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (!req.device) {
    res.status(401).json({ message: 'DEVICE_NOT_IDENTIFIED' });
    return;
  }

  if (req.device.status !== 'APPROVED') {
    res.status(403).json({ message: 'DEVICE_NOT_APPROVED' });
    return;
  }

  // Ensure device belongs to the shop in the URL
  const shopId = req.params.shopId;
  if (shopId && req.device.shopId !== shopId) {
    res.status(403).json({ message: 'DEVICE_SHOP_MISMATCH' });
    return;
  }

  next();
}