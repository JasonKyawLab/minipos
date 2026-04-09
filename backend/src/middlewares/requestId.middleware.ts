import { randomUUID } from "crypto";
import { Request, Response, NextFunction } from "express";
import { requestContext } from "../db/pool.js";

export function requestIdMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const requestId = randomUUID();
  req.headers["x-request-id"] = requestId;
  res.setHeader("x-request-id", requestId);
  
  requestContext.run({ requestId }, () => {
    next();
  });
}