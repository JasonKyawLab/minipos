// =========================================================
// user.service.ts
// Path: backend/src/modules/user/user.service.ts
// Line: Replace all error throws with appError
// =========================================================

import { UserRepository } from "./user.repository.js";
import { toUserShopDTO } from "./user.dto.js";
import { AuditService } from "../audit/audit.service.js";
import { appError } from "../../utils/appError.js";

export class UserService {
  static async updateMe(
    userId: string,
    data: { name?: string; email?: string }
  ) {
    if (!data.name && !data.email) {
      throw new appError("NOTHING_TO_UPDATE", 400);
    }

    const updateData: any = {};

    if (data.name) updateData.name = data.name;
    if (data.email) updateData.email = data.email;

    const user = await UserRepository.updateProfile(userId, updateData);
    if (!user) throw new appError("USER_NOT_FOUND", 404);

    await AuditService.log({
      userId,
      action: "USER_UPDATED_PROFILE",
      entity: "USER",
      entityId: userId,
      metadata: {
        updatedFields: Object.keys(updateData),
      },
    });
    return user;
  }

  static async deleteMe(userId: string) {
    await UserRepository.softDelete(userId);

    await AuditService.log({
      shopId: null,
      userId,
      action: "USER_SOFT_DELETED",
      entity: "USER",
      entityId: userId,
    });

    return { success: true };
  }

  static async getMyShops(userId: string) {
    const rows = await UserRepository.findMyShops(userId);
    return rows.map(toUserShopDTO);
  }
}