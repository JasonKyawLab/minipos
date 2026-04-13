// =========================================================
// device.service.ts
// Path: src/modules/device/device.service.ts
// =========================================================
// Business logic for device registration and management.
//
// Permission model:
//   - OWNER or MANAGER can approve / revoke / rename devices
//   - Any authenticated device can register itself (no user
//     auth required — just a valid X-Device-Key header)
// =========================================================

import { ShopRepository }  from '../shop/shop.repository.js';
import { AuditService }    from '../audit/audit.service.js';
import { DeviceRepository } from './device.repository.js';
import { appError }        from '../../utils/appError.js';

const MANAGE_ROLES = ['OWNER', 'MANAGER'] as const;

async function assertCanManage(shopId: string, userId: string) {
  const member = await ShopRepository.getUserShopMembership(shopId, userId);
  if (!member || !member.is_active || !MANAGE_ROLES.includes(member.role)) {
    throw new appError('FORBIDDEN', 403);
  }
  return member;
}

export class DeviceService {

  // ── Register (self-registration) ─────────────────────────
  // Called when the tablet boots and sends X-Device-Key for
  // the first time. No user auth needed — the device key IS
  // the authentication at this step.
  //
  // The device starts as PENDING. The owner must approve it
  // before it can activate POS/KITCHEN mode.
  static async registerDevice(params: {
    shopId:     string;
    deviceKey:  string;
    deviceName: string | null;
    userAgent:  string | null;
    ipAddress:  string | null;
  }) {
    // Verify the shop exists and is not deleted
    const { rows } = await import('../../db/pool.js').then(m =>
      m.pool.query(
        `SELECT id FROM shops WHERE id = $1 AND is_deleted = false`,
        [params.shopId]
      )
    );
    if (rows.length === 0) throw new appError('SHOP_NOT_FOUND', 404);

    const {device, isNew} = await DeviceRepository.registerDevice({
      shopId:     params.shopId,
      deviceKey:  params.deviceKey,
      deviceName: params.deviceName,
      userAgent:  params.userAgent,
      ipAddress:  params.ipAddress,
    });

    if (isNew) {
      await AuditService.log({
        shopId:   params.shopId,
        action:   'DEVICE_REGISTERED',
        entity:   'SHOP_DEVICE',
        entityId: device.id,
        metadata: { deviceKey: params.deviceKey, deviceName: params.deviceName },
      });
    }

    return {device, isNew};
  }

  // ── List all devices (owner/manager) ─────────────────────
  static async getDevices(shopId: string, requesterId: string) {
    await assertCanManage(shopId, requesterId);
    return DeviceRepository.findAllByShop(shopId);
  }

  // ── Approve a device ─────────────────────────────────────
  static async approveDevice(params: {
    shopId:      string;
    deviceId:    string;
    requesterId: string;
  }) {
    await assertCanManage(params.shopId, params.requesterId);

    const approved = await DeviceRepository.approveDevice(
      params.deviceId,
      params.shopId,
      params.requesterId
    );

    // approveDevice only updates PENDING → APPROVED.
    // If null, either device doesn't exist or isn't PENDING.
    if (!approved) {
      // Check if it exists at all to give a better error
      const existing = await DeviceRepository.findById(
        params.deviceId,
        params.shopId
      );
      if (!existing) throw new appError('DEVICE_NOT_FOUND', 404);
      throw new appError('DEVICE_NOT_PENDING', 409);
    }

    await AuditService.log({
      shopId:   params.shopId,
      userId:   params.requesterId,
      action:   'DEVICE_APPROVED',
      entity:   'SHOP_DEVICE',
      entityId: params.deviceId,
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
  // Only REVOKED devices can be deleted — this prevents
  // accidentally deleting an active POS tablet mid-shift.
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
      // Device exists but is not REVOKED
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