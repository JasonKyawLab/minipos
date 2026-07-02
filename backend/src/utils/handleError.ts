import { Response } from "express";
import { appError } from "./appError.js";

export function handleError(res: Response, err: unknown): void {
  if (err instanceof appError) {
    res.status(err.status).json({ message: err.code });
    return;
  }

  console.error("[UnhandledError]", err);
  res.status(500).json({ message: "Internal server error" });
}