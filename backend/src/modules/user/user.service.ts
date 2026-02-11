import { UserRepository } from "./user.repository.js";
import { hashPassword } from "../../utils/password.js";
import { toUserShopDTO } from "./user.dto.js";

export class UserService {
static async updateMe(
  userId: string,
  data: { name?: string; email?: string; password?: string }
) {
  if (!data.name && !data.email && !data.password) {
    throw new Error("NOTHING_TO_UPDATE");
  }

  const updateData: any = {};

  if (data.name) updateData.name = data.name;
  if (data.email) updateData.email = data.email;
  if (data.password) {
    updateData.password_hash = await hashPassword(data.password);
  }

  const user = await UserRepository.updateProfile(userId, updateData);
    if (!user) throw new Error("USER_NOT_FOUND");
  return user;
}

  static async deleteMe(userId: string) {
    await UserRepository.softDelete(userId);
    return { success: true };
  }

  
  static async getMyShops(userId: string) {
    const rows = await UserRepository.findMyShops(userId);
  return rows.map(toUserShopDTO);
}

}