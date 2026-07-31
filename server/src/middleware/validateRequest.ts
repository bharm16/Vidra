import type { Request, Response, NextFunction } from "express";
import { logger } from "@infrastructure/Logger";
import { respond } from "./respond.js";
import type { ValidationSchema } from "./types.js";

/**
 * Middleware factory for request validation using Zod schemas
 */
export function validateRequest(schema: ValidationSchema) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (
      !schema ||
      typeof (schema as { safeParse?: unknown }).safeParse !== "function"
    ) {
      logger.error("Invalid validation schema provided", undefined, {
        requestId: (req as Request & { id?: string }).id,
        path: req.path,
        schemaType: typeof schema,
      });

      respond.fail(res, req, 500, {
        error: "Internal server error",
        code: "SERVICE_UNAVAILABLE",
        details: "Invalid validation schema",
      });
      return;
    }

    const result = schema.safeParse(req.body);

    if (!result.success) {
      const firstError = result.error?.issues?.[0];
      logger.warn("Request validation failed", {
        requestId: (req as Request & { id?: string }).id,
        error: firstError?.message || "Validation failed",
        path: req.path,
      });

      respond.fail(res, req, 400, {
        error: "Validation failed",
        code: "INVALID_REQUEST",
        details: firstError?.message || "Invalid request data",
      });
      return;
    }

    // Replace request body with validated/sanitized value
    req.body = result.data;
    next();
  };
}
