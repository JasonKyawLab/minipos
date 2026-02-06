/**
  •	Login rules
	•	Password compare
	•	Decide success/failure
 */
import jwt from "jsonwebtoken";
import { UserRepository } from "../users/user.repository.js";
import { comparePassword, hashPassword } from "../../utils/password.js";

export class AuthService {

  static async login(email: string, password: string) {
    const user = await UserRepository.findByEmail(email);

    if (!user) {
      throw new Error("Invalid credentials");
    }

    if (user.status !== "ACTIVE") {
      throw new Error("User not active");
    }

    const isValid = await comparePassword(
      password,
      user.password_hash
    );

    if (!isValid) {
      throw new Error("Invalid credentials");
    }

    const token = jwt.sign(
    {
      userId: user.id,
      role: user.role,
    },
    process.env.JWT_SECRET!,
    { expiresIn: "1d" }
  );

  if (!process.env.JWT_SECRET) {
  throw new Error("JWT_SECRET is not defined");
}

      return {
    token,
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
    },
  };
  }

    static async register(
    name: string,
    email: string,
    password: string
  ) {
    const existing = await UserRepository.findByEmail(email);
    if (existing) {
      throw new Error("USER_EXISTS");
    }

    const passwordHash = await hashPassword(password);

    const user = await UserRepository.create({
      name,
      email,
      password_hash: passwordHash,
    });

    return user;
  }
  
}