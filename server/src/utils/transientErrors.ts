/**
 * Shared Transient Error Detection
 *
 * Centralizes the logic for determining whether an error is transient
 * (i.e. retryable) across all service domains. Domain-specific detectors
 * compose on top of this shared set.
 */

import { toErrorMessage } from "@shared/utils/error";

/**
 * Message substrings that indicate a transient/retryable failure
 * regardless of the originating service.
 */
const TRANSIENT_MESSAGE_HINTS = [
  "aborted",
  "cancelled",
  "timed out",
  "timeout",
  "etimedout",
  "econnreset",
  "econnrefused",
  "econnaborted",
  "epipe",
  "enetunreach",
  "service unavailable",
  "temporarily unavailable",
  "resource exhausted",
  "rate limit",
  "429",
  "deadline exceeded",
  "connection reset",
  "socket hang up",
  "fetch failed",
] as const;

/**
 * Node/libuv error codes for a network that misbehaved rather than a caller
 * that did. Kept beside the gRPC set because a process-level classifier needs
 * both: an unhandled rejection can carry either.
 */
const TRANSIENT_NETWORK_CODES = new Set([
  "eai_again",
  "econnaborted",
  "econnrefused",
  "econnreset",
  "enetunreach",
  "enotfound",
  "epipe",
  "etimedout",
]);

/**
 * Firestore gRPC status codes that represent transient failures.
 */
const TRANSIENT_FIRESTORE_CODES = new Set([
  "aborted",
  "cancelled",
  "deadline-exceeded",
  "internal",
  "resource-exhausted",
  "unavailable",
  "unknown",
]);

function extractErrorCode(error: unknown): string | null {
  if (!error || typeof error !== "object") {
    return null;
  }

  if (!("code" in error)) {
    return null;
  }

  const candidate = (error as { code?: unknown }).code;
  if (typeof candidate !== "string") {
    return null;
  }

  const trimmed = candidate.trim().toLowerCase();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Check if an error message contains any known transient failure hints.
 */
export function hasTransientMessageHint(error: unknown): boolean {
  const message = toErrorMessage(error).toLowerCase();
  return TRANSIENT_MESSAGE_HINTS.some((hint) => message.includes(hint));
}

/**
 * Check if an error is a transient Firestore error
 * (gRPC status code match OR message hint match).
 */
export function isTransientFirestoreError(error: unknown): boolean {
  const code = extractErrorCode(error);
  if (code && TRANSIENT_FIRESTORE_CODES.has(code)) {
    return true;
  }

  return hasTransientMessageHint(error);
}

/**
 * Generic transient error check — the question a caller with no domain asks:
 * "did the world misbehave, or did we?"
 *
 * Matches a network code, a gRPC status, or a message hint. Domain-specific
 * code should use the narrower variants (e.g. `isTransientFirestoreError`)
 * when it knows what it is talking to.
 *
 * This used to test message hints only, which is why `server.ts` — the
 * process-level unhandled-rejection classifier, which must weigh codes too —
 * grew its own pair of tables instead. Those tables then drifted: they were
 * missing `socket hang up` and `fetch failed`, the two commonest undici
 * failures, and there a miss means the process exits rather than retries.
 */
export function isTransientError(error: unknown): boolean {
  const code = extractErrorCode(error);
  if (
    code &&
    (TRANSIENT_NETWORK_CODES.has(code) || TRANSIENT_FIRESTORE_CODES.has(code))
  ) {
    return true;
  }

  return hasTransientMessageHint(error);
}
