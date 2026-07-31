/**
 * The one place an HTTP response body is built.
 *
 * Before this module the server emitted seven different envelope shapes for
 * the same concern — most visibly on `/api/llm/`, where two rate-limit guards
 * mounted back to back returned differently-shaped 5xx bodies. Every emitter
 * now routes through `respond`, so the wire format has exactly one definition
 * and `requestId` is attached in exactly one place.
 *
 * The canonical shapes are `ApiSuccessResponse<T>` and `ApiErrorResponse` from
 * shared/types/api.ts. Note that `success` is REQUIRED on both arms: the
 * client parses responses with `z.discriminatedUnion("success", …)`
 * (shared/schemas/api.schemas.ts, shared/schemas/preview.schemas.ts) and hard
 * `.parse()`s the result, so an error body without `success: false` throws in
 * the browser.
 *
 * `code` is typed `ApiErrorCode`, not `string`. That is deliberate: it makes
 * an undeclared error code a compile error rather than a response the client's
 * `z.enum(API_ERROR_CODES)` rejects at runtime. When the compiler rejects a
 * code, add it to `ApiErrorCode` or map it to an existing one — do not widen
 * the parameter type.
 */

import type { Request, Response } from "express";
import type {
  ApiErrorCode,
  ApiErrorResponse,
  ApiSuccessResponse,
} from "@shared/types/api";

type RequestWithId = Request & { id?: string };

export interface FailPayload {
  /**
   * Machine-readable code.
   *
   * The compile-time gate is the TYPE, not the requiredness: `code:
   * "ROUTE_TIMEOUT"` fails to compile whenever `ROUTE_TIMEOUT` is absent from
   * `ApiErrorCode`, optional or not. It is optional only because the global
   * error handler's final fallthrough classifies genuinely unknown throws,
   * where inventing a code would be a lie. Every deliberate emitter passes one.
   */
  code?: ApiErrorCode;
  /** Human-readable message. Clients read this field for display. */
  error: string;
  /** Optional flattened detail string (never structured — the contract is a string). */
  details?: string;
}

/**
 * Build the canonical error body. Kept separate from `fail` so the legacy
 * `sendApiError` shim can share it — the envelope has one definition even
 * while two entry points exist.
 *
 * @internal Prefer `respond.fail`.
 */
export function buildErrorBody(
  req: Request,
  payload: FailPayload,
): ApiErrorResponse {
  const requestId = (req as RequestWithId).id;
  return {
    success: false,
    error: payload.error,
    ...(payload.code ? { code: payload.code } : {}),
    ...(payload.details ? { details: payload.details } : {}),
    ...(requestId ? { requestId } : {}),
  };
}

/** Send the canonical success envelope. */
export function ok<T>(
  res: Response,
  req: Request,
  data: T,
  status = 200,
): Response<ApiSuccessResponse<T>> {
  const requestId = (req as RequestWithId).id;
  const body: ApiSuccessResponse<T> = {
    success: true,
    data,
    ...(requestId ? { requestId } : {}),
  };
  return res.status(status).json(body);
}

/** Send the canonical error envelope. */
export function fail(
  res: Response,
  req: Request,
  status: number,
  payload: FailPayload,
): Response<ApiErrorResponse> {
  return res.status(status).json(buildErrorBody(req, payload));
}

export const respond = { ok, fail } as const;
