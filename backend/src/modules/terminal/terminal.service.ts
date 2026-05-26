// Path: backend/src/modules/terminal/terminal.service.ts
// Purpose: All business logic for terminal activation, 
// delegation, and exit. This is where the "Burn the Ships"
// and "Delegated Authorization" protocols are enforced.

import { comparePassword } from '../../utils/password.js';
import { generateSessionToken, generateEmergencyCode, hashCode, verifyCode } from '../../utils/token.js';
import { TerminalRepository } from './terminal.repository.js';
import { ShopRepository }     from '../shop/shop.repository.js';
import { UserRepository }     from '../user/user.repository.js';
import { PosAuthRepository }  from '../pos-auth/pos-auth.repository.js';
import { AuditService }       from '../audit/audit.service.js';
import { appError }           from '../../utils/appError.js';
import { TerminalMode }       from './terminal.types.js';
import { DeviceRepository } from '../device/device.repository.js';

// Managers can re-authorize terminals but cannot generate emergency codes
const DELEGATION_ROLES = ['OWNER', 'MANAGER'] as const;

export class TerminalService {

static async activateTerminal(params: {
  shopId:      string;
  requesterId: string;
  password:    string;
  mode:        TerminalMode;
  deviceId:    string | null; // the device_key from localStorage (not a DB id)
}) {
  // Step 1: Verify requester is OWNER or MANAGER of this shop
  const member = await ShopRepository.getUserShopMembership(
    params.shopId, params.requesterId
  );
  if (!member || !member.is_active || !DELEGATION_ROLES.includes(member.role)) {
    throw new appError('FORBIDDEN', 403);
  }

  // Step 2: Verify platform password
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

  // Step 3: Resolve device status BEFORE touching terminal_sessions
  // device_id here is actually the device_key (the public localStorage UUID).
  // We must look it up to get the real shop_devices.id for the FK.
  let resolvedDeviceId: string | null = null;

  if (params.deviceId) {
    const device = await DeviceRepository.findByDeviceKey(
      params.deviceId,
      params.shopId
    );

    if (!device) {
      // Device has never registered — auto-register it as PENDING.
      // This is safe: the password was already verified above.
      // The FK crash happens because we tried to reference a non-existent row.
      // Auto-registration solves this at the root cause.
      const { device: newDevice } = await DeviceRepository.registerDevice({
        shopId:     params.shopId,
        deviceKey:  params.deviceId,
        deviceName: null,
        userAgent:  null, // not available in service layer
        ipAddress:  null,
      });

      await AuditService.log({
        shopId:   params.shopId,
        userId:   params.requesterId,
        action:   'DEVICE_AUTO_REGISTERED_ON_ACTIVATION',
        entity:   'SHOP_DEVICE',
        entityId: newDevice.id,
        metadata: { deviceKey: params.deviceId },
      });

      // Return AWAITING_APPROVAL — the owner must approve from the dashboard.
      // We return a typed object rather than throwing so the controller can
      // send a clean 202 response instead of a 500.
      return {
        status:   'AWAITING_APPROVAL' as const,
        deviceId: params.deviceId,
      };
    }

    if (device.status === 'PENDING') {
      // Device exists but owner hasn't approved it yet.
      return {
        status:   'AWAITING_APPROVAL' as const,
        deviceId: params.deviceId,
      };
    }

    if (device.status === 'REVOKED') {
      // Revoked devices are explicitly blocked from activating modes.
      throw new appError('DEVICE_NOT_APPROVED', 403);
    }

    // Device is APPROVED — use its real PK as the FK value.
    resolvedDeviceId = device.id;
  }

  // Step 4: Create the terminal session (device is APPROVED or absent)
  const sessionToken = generateSessionToken();

  const session = await TerminalRepository.createSession({
    shopId:          params.shopId,
    deviceId:        resolvedDeviceId, // real DB id (UUID) or null — never crashes
    sessionToken,
    mode:            params.mode,
    authorizedBy:    params.requesterId,
    authMethod:      'OWNER_PASSWORD',
    emergencyCodeId: null,
    expiresAt:       null,
  });

  await AuditService.log({
    shopId:   params.shopId,
    userId:   params.requesterId,
    action:   `TERMINAL_${params.mode}_ACTIVATED`,
    entity:   'TERMINAL_SESSION',
    entityId: session.id,
    metadata: { authMethod: 'OWNER_PASSWORD', deviceKey: params.deviceId },
  });

  return {
    status:       'ACTIVATED' as const,
    sessionToken,
    sessionId:    session.id,
  };
}

  // ── Activate Terminal via Manager PIN (Level 1 Delegation) ─
  // Used when: session expired and owner is not present.
  // A MANAGER can refresh the terminal using their shop PIN.
  // This is NOT their platform password — it's the shop PIN.
  static async activateViaManagerPin(params: {
    shopId:   string;
    userId:   string;  // The manager tapping their PIN
    pin:      string;
    mode:     TerminalMode;
    deviceId: string | null;
  }) {
    // Verify the user is a MANAGER of this shop
    const member = await ShopRepository.getUserShopMembership(
      params.shopId, params.userId
    );
    if (!member || !member.is_active || member.role !== 'MANAGER') {
      throw new appError('FORBIDDEN', 403);
    }

    // Verify their POS PIN (the 4-6 digit PIN, not the platform password)
    const membership = await PosAuthRepository.getMembership(
      params.shopId, params.userId
    );
    if (!membership?.pos_pin_hash) {
      throw new appError('PIN_NOT_SET', 401);
    }
    if (
      membership.pos_pin_locked_until &&
      new Date(membership.pos_pin_locked_until) > new Date()
    ) {
      throw new appError('PIN_LOCKED', 423);
    }

    const maxAttempts = await PosAuthRepository.getShopPinMaxAttempts(params.shopId);
    const { default: bcrypt } = await import('bcrypt');
    const isValid = await bcrypt.compare(params.pin, membership.pos_pin_hash);

    if (!isValid) {
      await PosAuthRepository.recordFailedAttempt(
        params.shopId, params.userId, maxAttempts
      );
      throw new appError('INVALID_CREDENTIALS', 401);
    }

    await PosAuthRepository.resetAttempts(params.shopId, params.userId);

    const sessionToken = generateSessionToken();

    const session = await TerminalRepository.createSession({
      shopId:          params.shopId,
      deviceId:        params.deviceId,
      sessionToken,
      mode:            params.mode,
      authorizedBy:    params.userId,
      authMethod:      'MANAGER_PIN',
      emergencyCodeId: null,
      // Manager delegated sessions expire after 8 hours
      // as an additional safety boundary
      expiresAt:       new Date(Date.now() + 8 * 60 * 60 * 1000),
    });

    await AuditService.log({
      shopId:   params.shopId,
      userId:   params.userId,
      action:   `TERMINAL_${params.mode}_ACTIVATED`,
      entity:   'TERMINAL_SESSION',
      entityId: session.id,
      metadata: { authMethod: 'MANAGER_PIN', deviceId: params.deviceId },
    });

    return { sessionToken, sessionId: session.id };
  }

  // ── Generate Emergency Code (Level 2 Delegation) ─────────
  // Owner generates from their dashboard when no manager is present.
  // Returns the PLAINTEXT code once — never stored plaintext.
  // After this function returns, the plaintext is gone forever.
  static async generateEmergencyCode(params: {
    shopId:      string;
    requesterId: string;
    mode:        TerminalMode;
  }) {
    // Only OWNER can generate emergency codes
    const member = await ShopRepository.getUserShopMembership(
      params.shopId, params.requesterId
    );
    if (!member || member.role !== 'OWNER' || !member.is_active) {
      throw new appError('FORBIDDEN', 403);
    }

    const plainCode = generateEmergencyCode();
    const codeHash  = await hashCode(plainCode);

    const code = await TerminalRepository.createEmergencyCode({
      shopId:      params.shopId,
      codeHash,
      mode:        params.mode,
      generatedBy: params.requesterId,
    });

    await AuditService.log({
      shopId:   params.shopId,
      userId:   params.requesterId,
      action:   'EMERGENCY_CODE_GENERATED',
      entity:   'EMERGENCY_CODE',
      entityId: code.id,
      metadata: { mode: params.mode, expiresAt: code.expires_at },
    });

    // Return plaintext code ONCE — frontend shows it to owner.
    // After this response, it cannot be recovered.
    return {
      code:       plainCode,
      mode:       params.mode,
      expiresAt:  code.expires_at,
      codeId:     code.id,
    };
  }

  // ── Activate Terminal via Emergency Code (Level 2) ────────
  // Staff types the code shown to the owner on their phone.
  // The code is single-use and expires after 5 minutes.
  static async activateViaEmergencyCode(params: {
    shopId:   string;
    code:     string;
    mode:     TerminalMode;
    // The user ID from the terminal's staff PIN login (if any)
    userId:   string | null;
    deviceId: string | null;
  }) {
    const pendingCode = await TerminalRepository.findPendingCode(
      params.shopId, params.mode
    );

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
      shopId:          params.shopId,
      deviceId:        params.deviceId,
      sessionToken,
      mode:            params.mode,
      // authorized_by is the code generator (the owner)
      authorizedBy:    pendingCode.generated_by,
      authMethod:      'EMERGENCY_CODE',
      emergencyCodeId: pendingCode.id,
      // Emergency sessions expire after 8 hours
      expiresAt:       new Date(Date.now() + 8 * 60 * 60 * 1000),
    });

    // Mark code as used (single-use enforcement)
    await TerminalRepository.markCodeUsed({
      codeId:    pendingCode.id,
      usedBy:    params.userId ?? pendingCode.generated_by,
      sessionId: session.id,
    });

    await AuditService.log({
      shopId:   params.shopId,
      userId:   params.userId ?? undefined,
      action:   `TERMINAL_${params.mode}_ACTIVATED`,
      entity:   'TERMINAL_SESSION',
      entityId: session.id,
      metadata: {
        authMethod:      'EMERGENCY_CODE',
        emergencyCodeId: pendingCode.id,
        authorizedBy:    pendingCode.generated_by,
      },
    });

    return { sessionToken, sessionId: session.id };
  }

  // ── Exit Terminal ("Burn the Ships" Step 2) ───────────────
  // Owner re-enters their password to exit.
  // Session is deleted. Fresh access_token issued by controller.
static async exitTerminal(params: {
  sessionToken: string | null;  // null for PIN-only sessions (Chef/Cashier)
  requesterId:  string;
  password:     string;
  shopId:       string;
}) {
  const member = await ShopRepository.getUserShopMembership(
    params.shopId, params.requesterId
  );
  if (!member || !member.is_active) {
    throw new appError('FORBIDDEN', 403);
  }

  const user = await UserRepository.findById(params.requesterId);
  if (!user) throw new appError('USER_NOT_FOUND', 404);

  const isValid = await comparePassword(params.password, user.password_hash);
  if (!isValid) throw new appError('INVALID_PASSWORD', 401);

  // Delete the terminal session if one exists
  // Chef/Cashier PIN sessions don't create terminal_session rows
  if (params.sessionToken) {
    await TerminalRepository.deleteSession(params.sessionToken);
  }

  await AuditService.log({
    shopId: params.shopId,
    userId: params.requesterId,
    action: 'TERMINAL_EXITED',
    entity: 'TERMINAL_SESSION',
    metadata: { hadTerminalSession: !!params.sessionToken },
  });

  return { success: true };
}

  // ── Remote Revocation (Kill Switch) ──────────────────────
  static async revokeSession(params: {
    sessionId:   string;
    requesterId: string;
    shopId:      string;
  }) {
    const member = await ShopRepository.getUserShopMembership(
      params.shopId, params.requesterId
    );
    if (!member || !member.is_active || !DELEGATION_ROLES.includes(member.role)) {
      throw new appError('FORBIDDEN', 403);
    }

    const revoked = await TerminalRepository.revokeSession({
      sessionId: params.sessionId,
      revokedBy: params.requesterId,
    });

    if (!revoked) throw new appError('SESSION_NOT_FOUND', 404);

    await AuditService.log({
      shopId:   params.shopId,
      userId:   params.requesterId,
      action:   'TERMINAL_SESSION_REVOKED',
      entity:   'TERMINAL_SESSION',
      entityId: params.sessionId,
    });

    return { success: true };
  }

  // ── Get Active Terminals (Dashboard View) ────────────────
  static async getActiveSessions(shopId: string, requesterId: string) {
    const member = await ShopRepository.getUserShopMembership(shopId, requesterId);
    if (!member || !member.is_active || !DELEGATION_ROLES.includes(member.role)) {
      throw new appError('FORBIDDEN', 403);
    }
    return TerminalRepository.findActiveSessionsForShop(shopId);
  }
}