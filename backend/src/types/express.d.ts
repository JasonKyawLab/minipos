import { JwtPayload } from "../middlewares/auth.middleware";

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

declare module "express-serve-static-core" {
  interface Request {
    user?: {
      id: string;
      role: "ADMIN" | "USER";
    };
  }
}

export {};