import type { Request, Response } from "express";
import { respond } from "./respond.js";

/**
 * Resolve a required route parameter, or write a 400 and return null.
 *
 * Emits the canonical error envelope via `respond.fail` so route handlers
 * never reconstruct it. Pairs with requireUserId — the two guards a handler
 * runs before it trusts `req.params` / `req.user`.
 */
export function requireRouteParam(
  req: Request,
  res: Response,
  key: string,
): string | null {
  const value = req.params[key];
  if (typeof value !== "string" || value.trim().length === 0) {
    respond.fail(res, req, 400, {
      error: `Invalid ${key}`,
      code: "INVALID_REQUEST",
    });
    return null;
  }
  return value;
}
