import { comparePassword }        from '../../utils/password.js';
import { AuditService }           from '../audit/audit.service.js';
import { DeviceModeRepository }   from './device-mode.repository.js';
import { UserRepository }         from '../user/user.repository.js';
import { appError }               from '../../utils/appError.js';
import { assertShopRole }         from '../../utils/authorize.js';
import { WRITE_ROLES }            from '../../constants/roles.constants.js';
import { DeviceMode }             from './device-mode.types.js';

export class DeviceModeService {

  // ── Activate Mode ─────────────────────────────────────────
  static async activateMode(params: {
    shopId:      string;
    deviceId:    string;
    requesterId: string;
    password:    string;
    mode:        DeviceMode;
  }) {
    await assertShopRole(params.shopId, params.requesterId, WRITE_ROLES);

    const user = await UserRepository.findById(params.requesterId);
    if (!user) throw new appError('USER_NOT_FOUND', 404);

    const isValid = await comparePassword(params.password, user.password_hash);
    if (!isValid) throw new appError('INVALID_PASSWORD', 401);

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
  static async getModeStatus(deviceId: string, shopId: string) {
    const device = await DeviceModeRepository.getDeviceMode(deviceId, shopId);
    if (!device) throw new appError('DEVICE_NOT_FOUND', 404);

    return {
      device_id:         device.id,
      device_name:       device.device_name,
      current_mode:      device.current_mode,
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
    await assertShopRole(params.shopId, params.requesterId, WRITE_ROLES);

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
  // BUG FIX #3 — device only needs to be APPROVED; mode-match
  // check removed since POS and Kitchen share one approval flow.
  static async recordStaffLogin(params: {
    shopId:   string;
    deviceId: string;
    userId:   string;
    mode:     DeviceMode;
  }) {
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
    await assertShopRole(params.shopId, params.requesterId, WRITE_ROLES);

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