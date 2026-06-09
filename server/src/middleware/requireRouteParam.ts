import type { Request, Response } from "express";

/**
 * Resolve a required route parameter, or write a 400 and return null.
 *
 * Owns the canonical "invalid route param" response shape
 * (`{ success: false, error }`) so route handlers never reconstruct it.
 * Pairs with requireUserId — the two guards a handler runs before it
 * trusts `req.params` / `req.user`.
 */
export function requireRouteParam(
  req: Request,
  res: Response,
  key: string,
): string | null {
  const value = req.params[key];
  if (typeof value !== "string" || value.trim().length === 0) {
    res.status(400).json({ success: false, error: `Invalid ${key}` });
    return null;
  }
  return value;
}
