// =========================================================
// admin.service.ts
// Path: backend/src/modules/admin/admin.service.ts
// Line: Replace all error throws with appError
// =========================================================

import { AdminRepository } from "./admin.repository.js";
import { AuditService } from "../audit/audit.service.js";
import { appError } from "../../utils/appError.js";

export class AdminService {

  static async getAllUsers() {
    return AdminRepository.findAllUsers();
  }

  static async promoteToAdmin(targetUserId: string, actorId: string) {
    if (targetUserId === actorId) {
      throw new appError("CANNOT_MODIFY_SELF_ROLE", 400);
    }

    const updated = await AdminRepository.updateUserRole(targetUserId, "ADMIN");
    if (!updated) throw new appError("USER_NOT_FOUND", 404);

    await AuditService.log({
      userId: actorId,
      action: "USER_PROMOTED_TO_ADMIN",
      entity: "USER",
      entityId: targetUserId,
      metadata: { newRole: "ADMIN" },
    });

    return { success: true };
  }

  static async demoteToUser(targetUserId: string, actorId: string) {
    if (targetUserId === actorId) {
      throw new appError("CANNOT_DEMOTE_SELF", 400);
    }

    const admins = await AdminRepository.countAdmins();
    if (admins <= 1) {
      throw new appError("CANNOT_DEMOTE_LAST_ADMIN", 400);
    }

    const updated = await AdminRepository.updateUserRole(targetUserId, "USER");
    if (!updated) throw new appError("USER_NOT_FOUND", 404);

    await AuditService.log({
      userId: actorId,
      action: "ADMIN_DEMOTED_TO_USER",
      entity: "USER",
      entityId: targetUserId,
      metadata: { newRole: "USER" },
    });

    return { success: true };
  }

  static async deleteUser(targetUserId: string, actorId: string) {
    if (targetUserId === actorId) {
      throw new appError("CANNOT_DELETE_SELF", 400);
    }

    const deleted = await AdminRepository.softDeleteUser(targetUserId);
    if (!deleted) throw new appError("USER_NOT_FOUND", 404);

    await AuditService.log({
      userId: actorId,
      action: "USER_SOFT_DELETED_BY_ADMIN",
      entity: "USER",
      entityId: targetUserId,
    });

    return { success: true };
  }

  static async restoreUser(targetUserId: string, actorId: string) {
    const restored = await AdminRepository.restoreUser(targetUserId);
    if (!restored) throw new appError("USER_NOT_FOUND", 404);

    await AuditService.log({
      userId: actorId,
      action: "USER_RESTORED_BY_ADMIN",
      entity: "USER",
      entityId: targetUserId,
    });

    return { success: true };
  }

  static async getAllShops() {
    return AdminRepository.findAllShops();
  }

  static async deleteShop(shopId: string, actorId: string) {
    const deleted = await AdminRepository.softDeleteShop(shopId);
    if (!deleted) throw new appError("SHOP_NOT_FOUND", 404);

    await AuditService.log({
      userId: actorId,
      action: "SHOP_SOFT_DELETED_BY_ADMIN",
      entity: "SHOP",
      entityId: shopId,
    });

    return { success: true };
  }

  static async restoreShop(shopId: string, actorId: string) {
    const restored = await AdminRepository.restoreShop(shopId);
    if (!restored) throw new appError("SHOP_NOT_FOUND", 404);

    await AuditService.log({
      userId: actorId,
      action: "SHOP_RESTORED_BY_ADMIN",
      entity: "SHOP",
      entityId: shopId,
    });

    return { success: true };
  }

  static async suspendShop(shopId: string, reason: string, actorId: string) {
    if (!reason || reason.trim().length < 3) {
      throw new appError("SUSPEND_REASON_REQUIRED", 400);
    }

    const suspended = await AdminRepository.suspendShop(shopId, reason.trim());
    if (!suspended) throw new appError("SHOP_NOT_FOUND", 404);

    await AuditService.log({
      userId: actorId,
      action: "SHOP_SUSPENDED_BY_ADMIN",
      entity: "SHOP",
      entityId: shopId,
      metadata: { reason: reason.trim() },
    });

    return { success: true };
  }

  static async unsuspendShop(shopId: string, actorId: string) {
    const unsuspended = await AdminRepository.unsuspendShop(shopId);
    if (!unsuspended) throw new appError("SHOP_NOT_FOUND", 404);

    await AuditService.log({
      userId: actorId,
      action: "SHOP_UNSUSPENDED_BY_ADMIN",
      entity: "SHOP",
      entityId: shopId,
    });

    return { success: true };
  }

  static async suspendUser(userId: string, actorId: string) {
    if (userId === actorId) {
      throw new appError("CANNOT_SUSPEND_SELF", 400);
    }
    const suspended = await AdminRepository.suspendUser(userId);
    if (!suspended) throw new appError("USER_NOT_FOUND", 404);

    await AuditService.log({
      userId: actorId,
      action: "USER_SUSPENDED_BY_ADMIN",
      entity: "USER",
      entityId: userId,
    });
    return { success: true };
  }

  static async reactivateUser(userId: string, actorId: string) {
    const reactivated = await AdminRepository.reactivateUser(userId);
    if (!reactivated) throw new appError("USER_NOT_FOUND", 404);

    await AuditService.log({
      userId: actorId,
      action: "USER_REACTIVATED_BY_ADMIN",
      entity: "USER",
      entityId: userId,
    });
    return { success: true };
  }

  static async getStats() {
    return AdminRepository.getStats();
  }
}