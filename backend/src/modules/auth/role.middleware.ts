import { Request, Response, NextFunction } from "express";

// export function requireRole(roles: string[]) {
//   return (req: Request, res: Response, next: NextFunction) => {
//     if (!req.user || !roles.includes(req.user.role)) {
//       return res.status(403).json({ message: "Forbidden" });
//     }
//     next();
//   };
// }

export function requireRole(roles: ("ADMIN" | "USER")[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) return res.sendStatus(401);

    if (!roles.includes(req.user.role)) {
      return res.sendStatus(403);
    }

    next();
  };
}