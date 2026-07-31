import type { Request, Response, NextFunction } from "express";
import { requireBody } from "./intake.js";
import type { ValidationSchema } from "./types.js";

/**
 * Middleware form of `intake.requireBody`, for routes that validate in the
 * chain rather than in the handler.
 *
 * It used to own a second, divergent 400: it reported only
 * `result.error.issues[0]`, so a body with four bad fields told the Creator
 * about one of them. It also carried a runtime "does this have `safeParse`?"
 * check that answered a malformed schema with a 500 — defending at runtime
 * against something `ValidationSchema` already prevents at compile time, and
 * turning a developer's typo into a production-shaped incident. Both are gone;
 * the emitter is `requireBody`, so this shares one 400 with every other route.
 */
export function validateRequest(schema: ValidationSchema) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const parsed = requireBody(schema, req, res);
    if (!parsed.ok) return;

    // Replace request body with validated/sanitized value
    req.body = parsed.value;
    next();
  };
}
