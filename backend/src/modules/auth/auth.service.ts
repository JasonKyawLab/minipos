import jwt from "jsonwebtoken";
import { UserRepository } from "../user/user.repository.js";
import { comparePassword, hashPassword } from "../../utils/password.js";

export class AuthService {

  /* ============================
     LOGIN
  ============================ */
  static async login(email: string, password: string) {
    const normalizedEmail = email.toLowerCase();

    const user = await UserRepository.findByEmail(normalizedEmail);
    if (!user) {
      throw new Error("USER_NOT_FOUND");
    }

    const isValid = await comparePassword(password, user.password_hash);
    if (!isValid) {
      throw new Error("INVALID_PASSWORD");
    }

    if (!process.env.JWT_SECRET) {
      throw new Error("JWT_SECRET_NOT_DEFINED");
    }

    const token = jwt.sign(
      {
        userId: user.id,
        role: user.role, // ADMIN | USER
      },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );

    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
      },
    };
  }

  /* ============================
     REGISTER (SYSTEM USER)
  ============================ */
static async register(
  name: string,
  email: string,
  password: string
) {
  const normalizedEmail = email.toLowerCase();

  const existing = await UserRepository.findByEmailIncludeDeleted(normalizedEmail);

  if (existing) {
    if (existing.is_deleted) {
      await UserRepository.activateUser(existing.id);

      return {
        restored: true,
      };
    }

    throw new Error("USER_EXISTS");
  }

  const passwordHash = await hashPassword(password);

  await UserRepository.create({
    name,
    email: normalizedEmail,
    password_hash: passwordHash,
    role: "USER",
  });

  return {
    restored: false,
  };
}


}