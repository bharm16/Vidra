import type { Request, Response } from "express";
import type { ApiErrorResponse as ApiError } from "@shared/types/api";
import { type FailPayload, buildErrorBody } from "./respond.js";

/**
 * Legacy entry point, kept for the ~70 existing call sites in the preview and
 * continuity handlers. It builds the body with `buildErrorBody`, so the
 * envelope — including `success: false` and `requestId` — has exactly one
 * definition shared with `respond.fail`.
 *
 * New code should call `respond.fail` directly.
 */
export function sendApiError(
  res: Response,
  req: Request,
  status: number,
  payload: FailPayload,
): Response<ApiError> {
  return res.status(status).json(buildErrorBody(req, payload));
}
