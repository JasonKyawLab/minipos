// =========================================================
// device.service.ts
// Path: backend/src/modules/device/device.service.ts
//
// ── BUG FIX: approveDevice must accept REVOKED → APPROVED ──
//
// PROBLEM
// ───────
// The original approveDevice() flow:
//
//   DeviceRepository.approveDevice()
//     → UPDATE ... WHERE id = $1 AND status = 'PENDING'
//
// The WHERE clause only matches PENDING devices.
// When a manager revokes a device and then tries to re-approve
// it from the Permissions page WITHOUT waiting for the tablet to
// self-register (which would reset it to PENDING), the UPDATE
// matches zero rows → returns null → service throws DEVICE_NOT_PENDING
// → frontend receives 409 Conflict.
//
// WHY the old design was wrong:
//   The Permissions page shows REVOKED devices with a "Re-approve"
//   button. The owner clicking Re-approve means exactly:
//   "I want this device active again." Forcing them to first revoke,
//   then wait for the tablet to re-register, then approve, is
//   unnecessary friction and confusing UX.
//
// FIX
// ───
//   Change the repository UPDATE to accept both PENDING and REVOKED:
//
//     WHERE id = $1 AND shop_id = $2 AND status IN ('PENDING', 'REVOKED')
//
//   The service error discrimination then becomes:
//     - null returned + device exists + status = APPROVED → DEVICE_ALREADY_APPROVED (409)
//     - null returned + device does not exist            → DEVICE_NOT_FOUND (404)
//
//   This makes re-approval a single click regardless of whether
//   the tablet has already self-registered or not.
//
// No other business logic has changed.
// =========================================================

import { randomBytes }      from 'crypto';
import { ShopRepository }   from '../shop/shop.repository.js';
import { AuditService }     from '../audit/audit.service.js';
import { DeviceRepository } from './device.repository.js';
import { appError }         from '../../utils/appError.js';
import { pool }             from '../../db/pool.js';

const MANAGE_ROLES = ['OWNER', 'MANAGER'] as const;

async function assertCanManage(shopId: string, userId: string) {
  const member = await ShopRepository.getUserShopMembership(shopId, userId);
  if (!member || !member.is_active || !MANAGE_ROLES.includes(member.role)) {
    throw new appError('FORBIDDEN', 403);
  }
  return member;
}

// ── Derive a human-readable device name ───────────────────
//
// Priority:
//   1. Caller explicitly passes a name   → use as-is (max 100 chars)
//   2. User-Agent header present         → extract browser/OS summary
//   3. Nothing available                 → "Browser Terminal"
function deriveDeviceName(
  suppliedName: string | null | undefined,
  userAgent:   string | null | undefined
): string {
  if (suppliedName && suppliedName.trim().length > 0) {
    return suppliedName.trim().slice(0, 100);
  }

  if (userAgent && userAgent.trim().length > 0) {
    const ua = userAgent.trim();

    let os = '';
    if (ua.includes('iPad'))            os = 'iPad';
    else if (ua.includes('iPhone'))     os = 'iPhone';
    else if (ua.includes('Android'))    os = 'Android';
    else if (ua.includes('Windows NT')) os = 'Windows';
    else if (ua.includes('Macintosh'))  os = 'Mac';
    else if (ua.includes('Linux'))      os = 'Linux';

    let browser = '';
    if (ua.includes('Edg/'))               browser = 'Edge';
    else if (ua.includes('OPR/') || ua.includes('Opera/')) browser = 'Opera';
    else if (ua.includes('Firefox/'))      browser = 'Firefox';
    else if (ua.includes('SamsungBrowser/')) browser = 'Samsung Browser';
    else if (ua.includes('Chrome/'))       browser = 'Chrome';
    else if (ua.includes('Safari/'))       browser = 'Safari';

    const label = [browser, os].filter(Boolean).join(' ');
    return label.length > 0 ? `${label} Terminal` : 'Browser Terminal';
  }

  return 'Browser Terminal';
}

// ── Normalise IP address ──────────────────────────────────
function normaliseIp(ip: string | null | undefined): string | null {
  if (!ip) return null;
  if (ip === '::1') return '127.0.0.1';
  if (ip.startsWith('::ffff:')) return ip.slice(7);
  return ip;
}

export class DeviceService {

  // ── Issue (or return) the hardware passport token ────────
  static async issueTerminalToken(params: {
    shopId:    string;
    deviceKey: string;
  }): Promise<{ terminalToken: string; deviceId: string } | null> {
    const { rows } = await pool.query(
      `
      SELECT id, terminal_token, status
      FROM shop_devices
      WHERE device_key = $1
        AND shop_id    = $2
      `,
      [params.deviceKey, params.shopId]
    );

    const device = rows[0];
    if (!device || device.status !== 'APPROVED') return null;

    if (device.terminal_token) {
      return { terminalToken: device.terminal_token, deviceId: device.id };
    }

    const token = randomBytes(32).toString('hex');

    await pool.query(
      `
      UPDATE shop_devices
      SET terminal_token           = $1,
          terminal_token_issued_at = now()
      WHERE id = $2
      `,
      [token, device.id]
    );

    return { terminalToken: token, deviceId: device.id };
  }

  // ── Register a device (idempotent, self-registration) ────
  static async registerDevice(params: {
    shopId:     string;
    deviceKey:  string;
    deviceName: string | null;
    userAgent:  string | null;
    ipAddress:  string | null;
  }) {
    const { rows } = await pool.query(
      `SELECT id FROM shops WHERE id = $1 AND is_deleted = false`,
      [params.shopId]
    );
    if (rows.length === 0) throw new appError('SHOP_NOT_FOUND', 404);

    const friendlyName = deriveDeviceName(params.deviceName, params.userAgent);
    const cleanIp      = normaliseIp(params.ipAddress);

    const { device, isNew } = await DeviceRepository.registerDevice({
      shopId:     params.shopId,
      deviceKey:  params.deviceKey,
      deviceName: friendlyName,
      userAgent:  params.userAgent ?? null,
      ipAddress:  cleanIp,
    });

    if (isNew) {
      await AuditService.log({
        shopId:   params.shopId,
        action:   'DEVICE_REGISTERED',
        entity:   'SHOP_DEVICE',
        entityId: device.id,
        metadata: {
          deviceKey:  params.deviceKey,
          deviceName: friendlyName,
        },
      });
    }

    return { device, isNew };
  }

  // ── List all devices for a shop ───────────────────────────
  static async getDevices(shopId: string, requesterId: string) {
    await assertCanManage(shopId, requesterId);
    return DeviceRepository.findAllByShop(shopId);
  }

  // ── Approve a device ─────────────────────────────────────
  //
  // BUG FIX: now accepts both PENDING and REVOKED devices.
  //
  // The Permissions page shows a "Re-approve" button on REVOKED
  // devices. Clicking it should immediately restore access — the
  // owner should not need to wait for the tablet to self-register
  // back to PENDING before being able to approve.
  //
  // Error discrimination after the fix:
  //   approved = null AND device exists AND status = APPROVED
  //     → throw DEVICE_ALREADY_APPROVED (409)
  //   approved = null AND device does not exist
  //     → throw DEVICE_NOT_FOUND (404)
  //   approved = row
  //     → return the approved device row ✓
  static async approveDevice(params: {
    shopId:      string;
    deviceId:    string;
    requesterId: string;
  }) {
    await assertCanManage(params.shopId, params.requesterId);

    // BUG FIX: pass acceptRevoked = true so the repository
    // WHERE clause includes 'REVOKED' alongside 'PENDING'.
    const approved = await DeviceRepository.approveDevice(
      params.deviceId,
      params.shopId,
      params.requesterId,
      true   // ← acceptRevoked
    );

    if (!approved) {
      const existing = await DeviceRepository.findById(
        params.deviceId,
        params.shopId
      );
      if (!existing) throw new appError('DEVICE_NOT_FOUND', 404);

      // Only remaining case: device exists but is already APPROVED.
      throw new appError('DEVICE_ALREADY_APPROVED', 409);
    }

    await AuditService.log({
      shopId:   params.shopId,
      userId:   params.requesterId,
      action:   'DEVICE_APPROVED',
      entity:   'SHOP_DEVICE',
      entityId: params.deviceId,
      metadata: { previousStatus: 'was PENDING or REVOKED' },
    });

    return approved;
  }

  // ── Revoke a device ──────────────────────────────────────
  static async revokeDevice(params: {
    shopId:      string;
    deviceId:    string;
    requesterId: string;
  }) {
    await assertCanManage(params.shopId, params.requesterId);

    const revoked = await DeviceRepository.revokeDevice(
      params.deviceId,
      params.shopId
    );

    if (!revoked) {
      const existing = await DeviceRepository.findById(
        params.deviceId,
        params.shopId
      );
      if (!existing) throw new appError('DEVICE_NOT_FOUND', 404);
      throw new appError('DEVICE_ALREADY_REVOKED', 409);
    }

    await AuditService.log({
      shopId:   params.shopId,
      userId:   params.requesterId,
      action:   'DEVICE_REVOKED',
      entity:   'SHOP_DEVICE',
      entityId: params.deviceId,
    });

    return revoked;
  }

  // ── Rename a device ──────────────────────────────────────
  static async renameDevice(params: {
    shopId:      string;
    deviceId:    string;
    requesterId: string;
    deviceName:  string;
  }) {
    await assertCanManage(params.shopId, params.requesterId);

    const updated = await DeviceRepository.renameDevice(
      params.deviceId,
      params.shopId,
      params.deviceName
    );
    if (!updated) throw new appError('DEVICE_NOT_FOUND', 404);

    await AuditService.log({
      shopId:   params.shopId,
      userId:   params.requesterId,
      action:   'DEVICE_RENAMED',
      entity:   'SHOP_DEVICE',
      entityId: params.deviceId,
      metadata: { deviceName: params.deviceName },
    });

    return updated;
  }

  // ── Delete a device ──────────────────────────────────────
  // Hard delete — only allowed on REVOKED devices.
  static async deleteDevice(params: {
    shopId:      string;
    deviceId:    string;
    requesterId: string;
  }) {
    await assertCanManage(params.shopId, params.requesterId);

    const deleted = await DeviceRepository.deleteDevice(
      params.deviceId,
      params.shopId
    );

    if (!deleted) {
      const existing = await DeviceRepository.findById(
        params.deviceId,
        params.shopId
      );
      if (!existing) throw new appError('DEVICE_NOT_FOUND', 404);
      throw new appError('DEVICE_MUST_BE_REVOKED_BEFORE_DELETE', 409);
    }

    await AuditService.log({
      shopId:   params.shopId,
      userId:   params.requesterId,
      action:   'DEVICE_DELETED',
      entity:   'SHOP_DEVICE',
      entityId: params.deviceId,
    });

    return { success: true };
  }
}