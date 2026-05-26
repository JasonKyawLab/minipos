// =========================================================
// device-mode.service.ts
// Path: backend/src/modules/device-mode/device-mode.service.ts
//
// ── BUG FIX #3: Unified device mode access (POS + KITCHEN) ──
//
// PROBLEM
// ───────
// The original recordStaffLogin() called:
//
//   if (!device || device.current_mode !== params.mode) {
//     throw new appError('DEVICE_NOT_IN_MODE', 409);
//   }
//
// This means a device activated as POS could NOT record a Kitchen
// staff login, and vice versa.  A manager approves ONE device record
// in the Permissions panel — there is no separate POS approval vs
// Kitchen approval.  Forcing separate mode locks for the same physical
// machine breaks the unified approval model.
//
// FIX
// ───
// Remove the mode-match check from recordStaffLogin().
// The device only needs to be APPROVED and have a non-null current_mode.
// The mode argument on the session row itself records which terminal type
// the staff member signed into — that is enough for audit purposes.
//
// Why this is safe:
//   - Device approval is already validated at the middleware layer
//     (requireVerifiedDevice) — the device must be APPROVED to reach
//     this code at all.
//   - The current_mode column records WHAT the owner activated the
//     device as, not a restriction on which routes can be used.
//   - Both POS and Kitchen share the same device approval workflow.
//     Requiring a separate mode activation per physical machine is
//     unnecessary operational overhead with no security benefit.
// =========================================================

import { comparePassword }        from '../../utils/password.js';
import { ShopRepository }         from '../shop/shop.repository.js';
import { AuditService }           from '../audit/audit.service.js';
import { DeviceModeRepository }   from './device-mode.repository.js';
import { UserRepository }         from '../user/user.repository.js';
import { appError }               from '../../utils/appError.js';
import { DeviceMode }             from './device-mode.types.js';

const MANAGE_ROLES = ['OWNER', 'MANAGER'] as const;

async function assertCanManageMode(shopId: string, userId: string) {
  const member = await ShopRepository.getUserShopMembership(shopId, userId);
  if (!member || !member.is_active || !MANAGE_ROLES.includes(member.role)) {
    throw new appError('FORBIDDEN', 403);
  }
  return member;
}

export class DeviceModeService {

  // ── Activate Mode ─────────────────────────────────────────
  // Owner/manager enters their platform password → device locks into mode.
  // The mode (POS | KITCHEN) is stored as current_mode on shop_devices.
  static async activateMode(params: {
    shopId:      string;
    deviceId:    string;
    requesterId: string;
    password:    string;
    mode:        DeviceMode;
  }) {
    await assertCanManageMode(params.shopId, params.requesterId);

    // Verify their platform password
    const user = await UserRepository.findById(params.requesterId);
    if (!user) throw new appError('USER_NOT_FOUND', 404);

    const isValid = await comparePassword(params.password, user.password_hash);
    if (!isValid) throw new appError('INVALID_PASSWORD', 401);

    // Check device is approved and not already in a mode
    const device = await DeviceModeRepository.getDeviceMode(
      params.deviceId,
      params.shopId
    );
    if (!device) throw new appError('DEVICE_NOT_FOUND', 404);

    if (device.status !== 'APPROVED') throw new appError('DEVICE_NOT_APPROVED', 403);

    if (device.current_mode) throw new appError('DEVICE_ALREADY_IN_MODE', 409);

    const activated = await DeviceModeRepository.activateMode({
      deviceId:    params.deviceId,
      shopId:      params.shopId,
      mode:        params.mode,
      activatedBy: params.requesterId,
    });
    if (!activated) throw new appError('DEVICE_NOT_FOUND', 404);

    await AuditService.log({
      shopId:   params.shopId,
      userId:   params.requesterId,
      action:   `${params.mode}_MODE_ACTIVATED`,
      entity:   'SHOP_DEVICE',
      entityId: params.deviceId,
      metadata: { mode: params.mode },
    });

    return { success: true, mode: params.mode };
  }

  // ── Get Device Mode Status ─────────────────────────────────
  // Frontend calls this on load to decide which UI to show.
  static async getModeStatus(deviceId: string, shopId: string) {
    const device = await DeviceModeRepository.getDeviceMode(deviceId, shopId);
    if (!device) throw new appError('DEVICE_NOT_FOUND', 404);

    return {
      device_id:         device.id,
      device_name:       device.device_name,
      current_mode:      device.current_mode,   // null | 'POS' | 'KITCHEN'
      mode_activated_at: device.mode_activated_at,
      is_in_mode:        device.current_mode !== null,
      status:            device.status,
    };
  }

  // ── Exit Mode ──────────────────────────────────────────────
  static async exitMode(params: {
    shopId:      string;
    deviceId:    string;
    requesterId: string;
    password?:   string;
    forced:      boolean;
  }) {
    await assertCanManageMode(params.shopId, params.requesterId);

    // Normal exit requires password — force exit does not
    if (!params.forced) {
      if (!params.password) throw new appError('PASSWORD_REQUIRED', 400);

      const user = await UserRepository.findById(params.requesterId);
      if (!user) throw new appError('USER_NOT_FOUND', 404);

      const isValid = await comparePassword(params.password, user.password_hash);
      if (!isValid) throw new appError('INVALID_PASSWORD', 401);
    }

    const device = await DeviceModeRepository.getDeviceMode(
      params.deviceId,
      params.shopId
    );
    if (!device) throw new appError('DEVICE_NOT_FOUND', 404);
    if (!device.current_mode) throw new appError('DEVICE_NOT_IN_MODE', 409);

    await DeviceModeRepository.exitMode({
      deviceId: params.deviceId,
      shopId:   params.shopId,
      exitedBy: params.requesterId,
    });

    await AuditService.log({
      shopId:   params.shopId,
      userId:   params.requesterId,
      action:   params.forced
        ? `${device.current_mode}_MODE_FORCE_EXITED`
        : `${device.current_mode}_MODE_EXITED`,
      entity:   'SHOP_DEVICE',
      entityId: params.deviceId,
      metadata: { forced: params.forced },
    });

    return { success: true };
  }

  // ── Record Staff Login ─────────────────────────────────────
  //
  // BUG FIX #3 — removed strict mode-match check.
  //
  // OLD (broken):
  //   if (!device || device.current_mode !== params.mode) {
  //     throw new appError('DEVICE_NOT_IN_MODE', 409);
  //   }
  //
  // This blocked a POS-approved device from recording a Kitchen login
  // and vice versa, despite both modes sharing the same device approval.
  //
  // NEW:
  //   Only check that the device is APPROVED.  The mode arg on the
  //   session row records which terminal type the staff signed into.
  //   The requireVerifiedDevice middleware already enforced APPROVED
  //   status before this service is reached.
  static async recordStaffLogin(params: {
    shopId:   string;
    deviceId: string;
    userId:   string;
    mode:     DeviceMode;
  }) {
    // Verify device exists and is APPROVED for this shop.
    // We no longer require device.current_mode === params.mode.
    const device = await DeviceModeRepository.getDeviceMode(
      params.deviceId,
      params.shopId
    );
    if (!device) throw new appError('DEVICE_NOT_FOUND', 404);
    if (device.status !== 'APPROVED') throw new appError('DEVICE_NOT_APPROVED', 403);

    const session = await DeviceModeRepository.recordStaffLogin({
      shopId:   params.shopId,
      deviceId: params.deviceId,
      userId:   params.userId,
      mode:     params.mode,
    });

    return { staff_session_id: session.id };
  }

  // ── Record Staff Logout ────────────────────────────────────
  static async recordStaffLogout(params: {
    shopId:   string;
    deviceId: string;
    userId:   string;
    forced:   boolean;
  }) {
    await DeviceModeRepository.recordStaffLogout({
      deviceId: params.deviceId,
      userId:   params.userId,
      reason:   params.forced ? 'FORCE' : 'SELF',
    });

    await AuditService.log({
      shopId:   params.shopId,
      userId:   params.userId,
      action:   params.forced ? 'MODE_STAFF_FORCE_LOGOUT' : 'MODE_STAFF_LOGOUT',
      entity:   'STAFF_MODE_SESSION',
      metadata: { deviceId: params.deviceId },
    });

    return { success: true };
  }

  // ── Get Staff Activity ─────────────────────────────────────
  static async getStaffActivity(params: {
    shopId:      string;
    deviceId:    string;
    requesterId: string;
    limit:       number;
    offset:      number;
  }) {
    await assertCanManageMode(params.shopId, params.requesterId);

    const device = await DeviceModeRepository.getDeviceMode(
      params.deviceId,
      params.shopId
    );
    if (!device) throw new appError('DEVICE_NOT_FOUND', 404);

    return DeviceModeRepository.getStaffActivity({
      deviceId: params.deviceId,
      shopId:   params.shopId,
      limit:    params.limit,
      offset:   params.offset,
    });
  }
}