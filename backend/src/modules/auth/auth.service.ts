import jwt, { JwtPayload } from "jsonwebtoken";
import { UserRepository } from "../user/user.repository.js";
import { comparePassword, hashPassword } from "../../utils/password.js";
import { AuditService } from "../audit/audit.service.js";
import { User } from "../user/user.model.js";
import { appError } from "../../utils/appError.js";
import { env } from "../../config/validation.js";

export class AuthService {

  static async login(email: string, password: string) {
    const normalizedEmail = email.toLowerCase();

    const user = await UserRepository.findByEmail(normalizedEmail);
    if (!user) {
      await AuditService.log({
        action: "LOGIN_FAILED",
        entity: "USER",
        metadata: { reason: "USER_NOT_FOUND", email: normalizedEmail },
      });
      throw new appError("INVALID_CREDENTIALS", 401);
    }

    const isValid = await comparePassword(password, user.password_hash);
    if (!isValid) {
      await AuditService.log({
        userId: user.id,
        action: "LOGIN_FAILED",
        entity: "USER",
        metadata: { reason: "INVALID_PASSWORD" },
      });
      throw new appError("INVALID_CREDENTIALS", 401);
    }

    if (!env.JWT_SECRET) {
      throw new appError("JWT_SECRET_NOT_DEFINED", 500);
    }

    const token = this.generateToken(user);

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

  static async register(name: string, email: string, password: string) {
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
        return { restored: true };
      }

      throw new appError("USER_EXISTS", 409);
    }

    const passwordHash = await hashPassword(password);

    const newUser = await UserRepository.create({
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

    return { restored: false };
  }

  static async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string
  ) {
    const user = await UserRepository.findById(userId);
    if (!user) {
      throw new appError("USER_NOT_FOUND", 404);
    }

    const isValid = await comparePassword(currentPassword, user.password_hash);

    if (!isValid) {
      await AuditService.log({
        userId,
        action: "PASSWORD_CHANGE_FAILED",
        entity: "USER",
        entityId: userId,
      });
      throw new appError("INVALID_CURRENT_PASSWORD", 401);
    }

    const samePassword = await comparePassword(newPassword, user.password_hash);

    if (samePassword) {
      await AuditService.log({
        userId,
        action: "PASSWORD_MUST_BE_DIFFERENT",
        entity: "USER",
        entityId: userId,
      });
      throw new appError("PASSWORD_MUST_BE_DIFFERENT", 400);
    }

    const newHash = await hashPassword(newPassword);

    const updatedUser = await UserRepository.updatePassword(userId, newHash);

    const token = this.generateToken(updatedUser);

    await AuditService.log({
      userId,
      action: "PASSWORD_CHANGED",
      entity: "USER",
      entityId: userId,
    });

    return token;
  }

  private static generateToken(user: User) {
    if (!env.JWT_SECRET) {
      throw new appError("JWT_SECRET_NOT_DEFINED", 500);
    }

    return jwt.sign(
      {
        userId: user.id,
        tokenVersion: user.token_version,
      },
      env.JWT_SECRET,
      { expiresIn: "1d" }
    );
  }
}