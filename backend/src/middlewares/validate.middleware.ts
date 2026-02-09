import { Request, Response, NextFunction } from "express";

export function requireBody(fields: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    for (const field of fields) {
      if (!req.body[field] || req.body[field].trim() === "") {
        return res.status(400).json({
          message: `${field} is required`,
        });
      }
    }
    next();
  };
}