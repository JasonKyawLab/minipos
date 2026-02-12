import { AdminRepository } from "./admin.repository.js";
import { AuditService } from "../audit/audit.service.js";

export class AdminService {

  /* ============================
     USERS
  ============================ */

  static async getAllUsers() {
    return AdminRepository.findAllUsers();
  }

  static async promoteToAdmin(targetUserId: string, actorId: string) {
    if (targetUserId === actorId) {
      throw new Error("CANNOT_MODIFY_SELF_ROLE");
    }

    const updated = await AdminRepository.updateUserRole(targetUserId, "ADMIN");
    if (!updated) throw new Error("USER_NOT_FOUND");

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
      throw new Error("CANNOT_DEMOTE_SELF");
    }

    // Optional: Prevent demoting last admin
    const admins = await AdminRepository.countAdmins();
    if (admins <= 1) {
      throw new Error("CANNOT_DEMOTE_LAST_ADMIN");
    }

    const updated = await AdminRepository.updateUserRole(targetUserId, "USER");
    if (!updated) throw new Error("USER_NOT_FOUND");

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
      throw new Error("CANNOT_DELETE_SELF");
    }

    const deleted = await AdminRepository.softDeleteUser(targetUserId);
    if (!deleted) throw new Error("USER_NOT_FOUND");

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
    if (!restored) throw new Error("USER_NOT_FOUND");

    await AuditService.log({
      userId: actorId,
      action: "USER_RESTORED_BY_ADMIN",
      entity: "USER",
      entityId: targetUserId,
    });

    return { success: true };
  }

  /* ============================
     SHOPS
  ============================ */

  static async getAllShops() {
    return AdminRepository.findAllShops();
  }

  static async deleteShop(shopId: string, actorId: string) {
    const deleted = await AdminRepository.softDeleteShop(shopId);
    if (!deleted) throw new Error("SHOP_NOT_FOUND");

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
    if (!restored) throw new Error("SHOP_NOT_FOUND");

    await AuditService.log({
      userId: actorId,
      action: "SHOP_RESTORED_BY_ADMIN",
      entity: "SHOP",
      entityId: shopId,
    });

    return { success: true };
  }
}