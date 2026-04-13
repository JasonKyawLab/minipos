import { ShopRepository }       from '../shop/shop.repository.js';
import { AuditService }         from '../audit/audit.service.js';
import { DeviceModeRepository } from './device-mode.repository.js';
import { comparePassword }      from '../../utils/password.js';
import { UserRepository }       from '../user/user.repository.js';
import { appError }             from '../../utils/appError.js';
import { DeviceMode }           from './device-mode.types.js';

const MANAGE_ROLES = ['OWNER', 'MANAGER'] as const;

async function assertCanManageMode(shopId: string, userId: string) {
  const member = await ShopRepository.getUserShopMembership(shopId, userId);
  if (!member || !member.is_active || !MANAGE_ROLES.includes(member.role)) {
    throw new appError('FORBIDDEN', 403);
  }
  return member;
}

export class DeviceModeService {

  // ── Activate Mode ─────────────────────────────────────
  // Owner/manager enters password → device locks into mode.
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

    // Check device is not already in a mode
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

  // ── Get Device Mode Status ────────────────────────────
  // Frontend calls this on load.
  // If current_mode is set → show PIN screen.
  // If null → show normal app.
  static async getModeStatus(deviceId: string, shopId: string) {
    const device = await DeviceModeRepository.getDeviceMode(deviceId, shopId);
    if (!device) throw new appError('DEVICE_NOT_FOUND', 404);

    return {
      device_id:          device.id,
      device_name:        device.device_name,
      current_mode:       device.current_mode,   // null | 'POS' | 'KITCHEN'
      mode_activated_at:  device.mode_activated_at,
      is_in_mode:         device.current_mode !== null,
      status:            device.status,
    };
  }

  // ── Exit Mode ─────────────────────────────────────────
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

  // ── Record Staff Login ────────────────────────────────
  // Called from POS/Kitchen auth after successful PIN login.
  static async recordStaffLogin(params: {
    shopId:   string;
    deviceId: string;
    userId:   string;
    mode:     DeviceMode;
  }) {
    // Verify device is actually in the expected mode
    const device = await DeviceModeRepository.getDeviceMode(
      params.deviceId,
      params.shopId
    );
    if (!device || device.current_mode !== params.mode) {
      throw new appError('DEVICE_NOT_IN_MODE', 409);
    }

    const session = await DeviceModeRepository.recordStaffLogin({
      shopId:   params.shopId,
      deviceId: params.deviceId,
      userId:   params.userId,
      mode:     params.mode,
    });

    return { staff_session_id: session.id };
  }

  // ── Record Staff Logout ───────────────────────────────
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

  // ── Get Staff Activity ────────────────────────────────
  static async getStaffActivity(params: {
  shopId:      string;
  deviceId:    string;
  requesterId: string;
  limit:       number;
  offset:      number;
}) {
  await assertCanManageMode(params.shopId, params.requesterId);

  // Verify device exists and belongs to this shop
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