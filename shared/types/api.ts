/**
 * Shared API contract types.
 *
 * These types define the canonical shape of every HTTP response the server
 * returns and every error the client must handle.  Both the server error
 * handler and the client response handler import from here — making this the
 * single source of truth for the API wire format.
 */

// ---------------------------------------------------------------------------
// Error codes
// ---------------------------------------------------------------------------

/**
 * Exhaustive list of machine-readable error codes the server may return.
 *
 * Adding a code here is safe (additive).  Removing one is a BREAKING CHANGE
 * that requires a client migration.
 */
export type ApiErrorCode =
  | "AUTH_REQUIRED"
  | "INVALID_REQUEST"
  | "INSUFFICIENT_CREDITS"
  | "RATE_LIMITED"
  | "SERVICE_UNAVAILABLE"
  | "LLM_UNAVAILABLE"
  | "GENERATION_FAILED"
  | "IDEMPOTENCY_KEY_REQUIRED"
  | "IDEMPOTENCY_CONFLICT"
  | "REQUEST_IN_PROGRESS"
  | "SESSION_VERSION_CONFLICT"
  // Operational codes. These were already emitted on the wire before they were
  // declared here, which made `ApiErrorCodeSchema` (a z.enum over
  // API_ERROR_CODES) reject responses the server genuinely sends — see
  // PreviewErrorArmSchema in shared/schemas/preview.schemas.ts, which the
  // client hard-`.parse()`s. Declaring them is the fix, not a new capability.
  | "ROUTE_TIMEOUT"
  | "RATE_LIMIT_UNAVAILABLE"
  | "QUEUE_FULL"
  | "QUEUE_TIMEOUT"
  | "SESSION_EXPIRED"
  | "VIDEO_PROVIDER_TIMEOUT";

/** All valid error code values, usable at runtime for validation. */
export const API_ERROR_CODES = [
  "AUTH_REQUIRED",
  "INVALID_REQUEST",
  "INSUFFICIENT_CREDITS",
  "RATE_LIMITED",
  "SERVICE_UNAVAILABLE",
  "LLM_UNAVAILABLE",
  "GENERATION_FAILED",
  "IDEMPOTENCY_KEY_REQUIRED",
  "IDEMPOTENCY_CONFLICT",
  "REQUEST_IN_PROGRESS",
  "SESSION_VERSION_CONFLICT",
  "ROUTE_TIMEOUT",
  "RATE_LIMIT_UNAVAILABLE",
  "QUEUE_FULL",
  "QUEUE_TIMEOUT",
  "SESSION_EXPIRED",
  "VIDEO_PROVIDER_TIMEOUT",
] as const satisfies readonly ApiErrorCode[];

// ---------------------------------------------------------------------------
// Error response shape
// ---------------------------------------------------------------------------

/**
 * Wire format for all error responses.
 *
 * `success: false` is the discriminant `ApiResponseSchema` and
 * `PreviewErrorArmSchema` switch on, so it is REQUIRED — an error body without
 * it fails the client's discriminated-union parse. This interface is the error
 * arm of `ApiResponse<T>` below; the two must stay identical.
 *
 * Build it with `respond.fail` (server/src/middleware/respond.ts) rather than
 * by hand — that is the one place `requestId` is attached.
 */
export interface ApiErrorResponse {
  success: false;
  error: string;
  code?: ApiErrorCode;
  details?: string;
  requestId?: string;
}

// ---------------------------------------------------------------------------
// Success response envelope
// ---------------------------------------------------------------------------

/**
 * Canonical success envelope.
 *
 * New endpoints MUST use this shape.  Existing endpoints that return raw
 * domain objects are being migrated incrementally.
 */
export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
  requestId?: string;
}

/**
 * Union type representing any API response — success or error.
 * Useful for client-side discriminated unions.
 */
export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;
