import { Request, Response, NextFunction } from "express";
import { ZodSchema, ZodError } from "zod";

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

// ── Zod schema validator ──────────────────────────────────────────────────────
// Use for checking, number ranges, URL format, etc.
// validate(createProductSchema)
export function validate(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      req.body = schema.parse(req.body);
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        const errors = err.issues.map((e) => ({
          field: e.path.join("."),
          message: e.message,
        }));
        res.status(400).json({ message: "Validation failed", details: errors });
        return;
      }
      next(err);
    }
  };
}