import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { JwtPayload } from "./auth.types.js";
import { UserRepository } from "../user/user.repository.js";

/* ============================
    AUTH MIDDLEWARE
    This middleware will verify the JWT token and attach the user info to the request object
============================ */

// Must match the options used when the cookie was originally set in
// auth.controller.ts's login handler (res.cookie("access_token", ...)).
// clearCookie() only removes a cookie if its options (path, sameSite,
// secure, domain) match how it was set — passing none of them, or the
// wrong ones, makes the browser silently keep the old cookie. That
// mismatch was the root cause of the /login <-> /dashboard redirect
// loop for suspended users: the backend correctly returned 401, but
// the cookie never actually cleared, so middleware kept seeing a
// cookie and bouncing the user straight back to /dashboard.
const ACCESS_TOKEN_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
};

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
) {
  // const header = req.headers.authorization;

  // if (!header) {
  //   return res.status(401).json({ message: "Missing Authorization header" });
  // }
  //  const token = header.split(" ")[1];

    const token = req.cookies.access_token;

    if (!token) {
      return res.status(401).json({ message: "Not authenticated" });
    }
  try {
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET!
    ) as JwtPayload;

    const user = await UserRepository.findById(decoded.userId);

    if (!user || user.is_deleted) {
      res.clearCookie("access_token", ACCESS_TOKEN_COOKIE_OPTIONS);
      return res.status(401).json({ message: "Invalid user" });
    }

    if (user.status === "SUSPENDED") {
      res.clearCookie("access_token", ACCESS_TOKEN_COOKIE_OPTIONS);
      return res.status(401).json({ message: "Account suspended" });
    }

    if (user.token_version !== decoded.tokenVersion) {
      res.clearCookie("access_token", ACCESS_TOKEN_COOKIE_OPTIONS);
      return res.status(401).json({ message: "Token expired" });
    }

    req.user = {
      id: user.id,
      role: user.role,
    };

    next();
  } catch {
    // Token missing/invalid/expired at the jwt.verify() stage — also
    // clear the cookie here, since a malformed or expired token should
    // be wiped the same way an invalid/suspended user is.
    res.clearCookie("access_token", ACCESS_TOKEN_COOKIE_OPTIONS);
    return res.status(401).json({ message: "Invalid token" });
  }
}