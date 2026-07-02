//=========================================================
// Purpose: All business logic for terminal activation,
// delegation, and exit. This is where the "Burn the Ships"
// and "Delegated Authorization" protocols are enforced.
//=========================================================

import { comparePassword } from '../../utils/password.js';
import { generateSessionToken, generateEmergencyCode, hashCode, verifyCode } from '../../utils/token.js';
import { TerminalRepository } from './terminal.repository.js';
import { UserRepository } from '../user/user.repository.js';
import { PosAuthRepository } from '../pos-auth/pos-auth.repository.js';
import { AuditService } from '../audit/audit.service.js';
import { AuthService } from '../auth/auth.service.js';
import { DeviceModeRepository } from '../device-mode/device-mode.repository.js';
import { appError } from '../../utils/appError.js';
import { assertShopRole } from '../../utils/authorize.js';
import { WRITE_ROLES } from '../../constants/roles.constants.js';
import { TerminalMode, TerminalSession } from './terminal.types.js';
import { DeviceRepository } from '../device/device.repository.js';
import { ShopRepository } from '../shop/shop.repository.js';
import { User } from '../user/user.model.js';

type ExitNoSession = { status: 'NO_SESSION' };
type ExitSessionInvalid = { status: 'SESSION_INVALID' };
type ExitUserNotFound = { status: 'USER_NOT_FOUND' };
type ExitInvalidPassword = { status: 'INVALID_PASSWORD' };
type ExitSuccess = { status: 'SUCCESS'; newAccessToken: string; session: TerminalSession; user: User };

type ExitTerminalResult = ExitNoSession | ExitSessionInvalid | ExitUserNotFound | ExitInvalidPassword | ExitSuccess;

export class TerminalService {

  static async activateTerminal(params: {
    shopId: string;
    requesterId: string;
    password: string;
    mode: TerminalMode;
    deviceId: string | null;
  }) {
    await assertShopRole(params.shopId, params.requesterId, WRITE_ROLES);

    const user = await UserRepository.findById(params.requesterId);
    if (!user) throw new appError('USER_NOT_FOUND', 404);

    const isValid = await comparePassword(params.password, user.password_hash);
    if (!isValid) {
      await AuditService.log({
        shopId: params.shopId,
        userId: params.requesterId,
        action: 'TERMINAL_ACTIVATION_PASSWORD_FAILED',
        entity: 'TERMINAL_SESSION',
        metadata: { mode: params.mode },
      });
      throw new appError('INVALID_PASSWORD', 401);
    }

    let resolvedDeviceId: string | null = null;

    if (params.deviceId) {
      const device = await DeviceRepository.findByDeviceKey(params.deviceId, params.shopId);

      if (!device) {
        const { device: newDevice } = await DeviceRepository.registerDevice({
          shopId: params.shopId,
          deviceKey: params.deviceId,
          deviceName: null,
          userAgent: null,
          ipAddress: null,
        });

        await AuditService.log({
          shopId: params.shopId,
          userId: params.requesterId,
          action: 'DEVICE_AUTO_REGISTERED_ON_ACTIVATION',
          entity: 'SHOP_DEVICE',
          entityId: newDevice.id,
          metadata: { deviceKey: params.deviceId },
        });

        return { status: 'AWAITING_APPROVAL' as const, deviceId: params.deviceId };
      }

      if (device.status === 'PENDING') {
        return { status: 'AWAITING_APPROVAL' as const, deviceId: params.deviceId };
      }

      if (device.status === 'REVOKED') {
        throw new appError('DEVICE_NOT_APPROVED', 403);
      }

      resolvedDeviceId = device.id;
    }

    const sessionToken = generateSessionToken();

    const session = await TerminalRepository.createSession({
      shopId: params.shopId,
      deviceId: resolvedDeviceId,
      sessionToken,
      mode: params.mode,
      authorizedBy: params.requesterId,
      authMethod: 'OWNER_PASSWORD',
      emergencyCodeId: null,
      expiresAt: null,
    });

    await AuditService.log({
      shopId: params.shopId,
      userId: params.requesterId,
      action: `TERMINAL_${params.mode}_ACTIVATED`,
      entity: 'TERMINAL_SESSION',
      entityId: session.id,
      metadata: { authMethod: 'OWNER_PASSWORD', deviceKey: params.deviceId },
    });

    return { status: 'ACTIVATED' as const, sessionToken, sessionId: session.id };
  }

  static async activateViaManagerPin(params: {
    shopId: string;
    userId: string;
    pin: string;
    mode: TerminalMode;
    deviceId: string | null;
  }) {
    const member = await ShopRepository.getUserShopMembership(params.shopId, params.userId);
    if (!member || !member.is_active || member.role !== 'MANAGER') {
      throw new appError('FORBIDDEN', 403);
    }

    const membership = await PosAuthRepository.getMembership(params.shopId, params.userId);
    if (!membership?.pos_pin_hash) {
      throw new appError('PIN_NOT_SET', 401);
    }
    if (membership.pos_pin_locked_until && new Date(membership.pos_pin_locked_until) > new Date()) {
      throw new appError('PIN_LOCKED', 423);
    }

    const maxAttempts = await PosAuthRepository.getShopPinMaxAttempts(params.shopId);
    const { default: bcrypt } = await import('bcrypt');
    const isValid = await bcrypt.compare(params.pin, membership.pos_pin_hash);

    if (!isValid) {
      await PosAuthRepository.recordFailedAttempt(params.shopId, params.userId, maxAttempts);
      throw new appError('INVALID_CREDENTIALS', 401);
    }

    await PosAuthRepository.resetAttempts(params.shopId, params.userId);

    const sessionToken = generateSessionToken();

    const session = await TerminalRepository.createSession({
      shopId: params.shopId,
      deviceId: params.deviceId,
      sessionToken,
      mode: params.mode,
      authorizedBy: params.userId,
      authMethod: 'MANAGER_PIN',
      emergencyCodeId: null,
      expiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000),
    });

    await AuditService.log({
      shopId: params.shopId,
      userId: params.userId,
      action: `TERMINAL_${params.mode}_ACTIVATED`,
      entity: 'TERMINAL_SESSION',
      entityId: session.id,
      metadata: { authMethod: 'MANAGER_PIN', deviceId: params.deviceId },
    });

    return { sessionToken, sessionId: session.id };
  }

  static async generateEmergencyCode(params: {
    shopId: string;
    requesterId: string;
    mode: TerminalMode;
  }) {
    const member = await ShopRepository.getUserShopMembership(params.shopId, params.requesterId);
    if (!member || member.role !== 'OWNER' || !member.is_active) {
      throw new appError('FORBIDDEN', 403);
    }

    const plainCode = generateEmergencyCode();
    const codeHash = await hashCode(plainCode);

    const code = await TerminalRepository.createEmergencyCode({
      shopId: params.shopId,
      codeHash,
      mode: params.mode,
      generatedBy: params.requesterId,
    });

    await AuditService.log({
      shopId: params.shopId,
      userId: params.requesterId,
      action: 'EMERGENCY_CODE_GENERATED',
      entity: 'EMERGENCY_CODE',
      entityId: code.id,
      metadata: { mode: params.mode, expiresAt: code.expires_at },
    });

    return { code: plainCode, mode: params.mode, expiresAt: code.expires_at, codeId: code.id };
  }

  static async activateViaEmergencyCode(params: {
    shopId: string;
    code: string;
    mode: TerminalMode;
    userId: string | null;
    deviceId: string | null;
  }) {
    const pendingCode = await TerminalRepository.findPendingCode(params.shopId, params.mode);

    if (!pendingCode) {
      throw new appError('EMERGENCY_CODE_NOT_FOUND', 404);
    }

    const isValid = await verifyCode(params.code, pendingCode.code_hash);
    if (!isValid) {
      await AuditService.log({
        shopId: params.shopId,
        action: 'EMERGENCY_CODE_FAILED',
        entity: 'EMERGENCY_CODE',
        entityId: pendingCode.id,
        metadata: { mode: params.mode },
      });
      throw new appError('INVALID_EMERGENCY_CODE', 401);
    }

    const sessionToken = generateSessionToken();

    const session = await TerminalRepository.createSession({
      shopId: params.shopId,
      deviceId: params.deviceId,
      sessionToken,
      mode: params.mode,
      authorizedBy: pendingCode.generated_by,
      authMethod: 'EMERGENCY_CODE',
      emergencyCodeId: pendingCode.id,
      expiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000),
    });

    await TerminalRepository.markCodeUsed({
      codeId: pendingCode.id,
      usedBy: params.userId ?? pendingCode.generated_by,
      sessionId: session.id,
    });

    await AuditService.log({
      shopId: params.shopId,
      userId: params.userId ?? undefined,
      action: `TERMINAL_${params.mode}_ACTIVATED`,
      entity: 'TERMINAL_SESSION',
      entityId: session.id,
      metadata: {
        authMethod: 'EMERGENCY_CODE',
        emergencyCodeId: pendingCode.id,
        authorizedBy: pendingCode.generated_by,
      },
    });

    return { sessionToken, sessionId: session.id };
  }

  static async exitTerminal(params: {
    shopId: string;
    sessionToken: string | null;
    password: string;
  }): Promise<ExitTerminalResult> {
    if (!params.sessionToken) {
      return { status: 'NO_SESSION' };
    }

    const session = await TerminalRepository.findActiveSession(params.sessionToken);
    if (!session || session.shop_id !== params.shopId) {
      return { status: 'SESSION_INVALID' };
    }

    const user = await UserRepository.findById(session.authorized_by);
    if (!user) {
      return { status: 'USER_NOT_FOUND' };
    }

    const isValid = await comparePassword(params.password, user.password_hash);
    if (!isValid) {
      return { status: 'INVALID_PASSWORD' };
    }

    await DeviceModeRepository.closeSessionsOnTerminalExit({
      shopId: params.shopId,
      deviceId: session.device_id ?? null,
      mode: session.mode,
    });

    await TerminalRepository.deleteSession(params.sessionToken);

    const newAccessToken = await AuthService.issueTokenForUser(user.id);

    await AuditService.log({
      shopId: params.shopId,
      userId: user.id,
      action: 'TERMINAL_EXITED',
      entity: 'TERMINAL_SESSION',
      entityId: session.id,
      metadata: {
        mode: session.mode,
        resolvedRole: user.role,
        resolvedName: user.name,
        sessionId: session.id,
        deviceId: session.device_id ?? 'unknown',
        shiftsClosedAt: new Date().toISOString(),
      },
    });

    return { status: 'SUCCESS', newAccessToken, session, user };
  }

  static async revokeSession(params: {
    sessionId: string;
    requesterId: string;
    shopId: string;
  }) {
    await assertShopRole(params.shopId, params.requesterId, WRITE_ROLES);

    const revoked = await TerminalRepository.revokeSession({
      sessionId: params.sessionId,
      revokedBy: params.requesterId,
    });

    if (!revoked) throw new appError('SESSION_NOT_FOUND', 404);

    await AuditService.log({
      shopId: params.shopId,
      userId: params.requesterId,
      action: 'TERMINAL_SESSION_REVOKED',
      entity: 'TERMINAL_SESSION',
      entityId: params.sessionId,
    });

    return { success: true };
  }

  static async getActiveSessions(shopId: string, requesterId: string) {
    await assertShopRole(shopId, requesterId, WRITE_ROLES);
    return TerminalRepository.findActiveSessionsForShop(shopId);
  }
}