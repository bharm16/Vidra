import type { Request, Response } from "express";
import { respond } from "./respond.js";

export type RequestWithUser = Request & { user?: { uid?: string } };

export function requireUserId(
  req: RequestWithUser,
  res: Response,
): string | null {
  const userId = req.user?.uid;
  if (!userId) {
    respond.fail(res, req, 401, {
      error: "Authentication required",
      code: "AUTH_REQUIRED",
    });
    return null;
  }
  return userId;
}
