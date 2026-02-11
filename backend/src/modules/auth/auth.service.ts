import jwt from "jsonwebtoken";
import { UserRepository } from "../user/user.repository.js";
import { comparePassword, hashPassword } from "../../utils/password.js";
import { AuditService } from "../audit/audit.service.js";

export class AuthService {

  /* ============================
     LOGIN
  ============================ */
  static async login(email: string, password: string) {
    const normalizedEmail = email.toLowerCase();

    const user = await UserRepository.findByEmail(normalizedEmail);
    if (!user) {

          await AuditService.log({
      action: "LOGIN_FAILED",
      entity: "USER",
      metadata: { email: normalizedEmail },// need to hash email in production. use raw email for now for testing only
    });

      throw new Error("USER_NOT_FOUND");
    }

    const isValid = await comparePassword(password, user.password_hash);
    if (!isValid) {

          await AuditService.log({
      userId: user.id,
      action: "LOGIN_FAILED",
      entity: "USER",
    });

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

      await AuditService.log({
    userId: user.id,
    action: "LOGIN_SUCCESS",
    entity: "USER",
    entityId: user.id,
  });

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

          await AuditService.log({
      userId: existing.id,
      action: "USER_RESTORED",
      entity: "USER",
      entityId: existing.id,
    });
      return {
        restored: true,
      };
    }

    throw new Error("USER_EXISTS");
  }

  const passwordHash = await hashPassword(password);

  const newUser =await UserRepository.create({
    name,
    email: normalizedEmail,
    password_hash: passwordHash,
    role: "USER",
  });

  await AuditService.log({
  userId: newUser.id,
  action: "USER_REGISTERED",
  entity: "USER",
  entityId: newUser.id,
});

  return {
    restored: false,
  };
}


}