import { UserRepository } from "./user.repository.js";
import { hashPassword } from "../../utils/password.js";

export class UserService {
  static async registerOwner(
    name: string,
    email: string,
    password: string
  ) {
    // 1. Check existing user
    const existingUser = await UserRepository.findByEmail(email);

    if (existingUser) {
      throw new Error("USER_ALREADY_EXISTS");
    }

    // 2. Hash password
    const passwordHash = await hashPassword(password);

    // 3. Create user
    return UserRepository.create({
      name,
      email,
      password_hash: passwordHash,
      role: "OWNER",
      status: "ACTIVE",
    });
  }
}