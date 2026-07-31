import { logger } from "@infrastructure/Logger";
import type { NextFunction, Request, Response } from "express";
import { isDomainError } from "@server/errors/DomainError";
import type { ApiErrorCode } from "@shared/types/api";
import { respond } from "./respond.js";

const EMAIL_RE = /[\w.-]+@[\w.-]+\.\w+/g;
const SSN_RE = /\b\d{3}-\d{2}-\d{4}\b/g;
const CARD_RE = /\b\d{16}\b/g;
const PHONE_RE = /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g;
const KEY_RE = /\b[A-Za-z0-9]{32,}\b/g;

/**
 * Redact sensitive data from strings
 * Removes PII like emails, SSNs, credit cards, phone numbers
 */
function redactSensitiveData(obj: unknown): unknown {
  if (typeof obj === "string") {
    return (
      obj
        // Redact email addresses
        .replace(EMAIL_RE, "[EMAIL_REDACTED]")
        // Redact SSN patterns (XXX-XX-XXXX)
        .replace(SSN_RE, "[SSN_REDACTED]")
        // Redact credit card numbers (16 digits)
        .replace(CARD_RE, "[CARD_REDACTED]")
        // Redact phone numbers (various formats)
        .replace(PHONE_RE, "[PHONE_REDACTED]")
        // Redact API keys (common patterns)
        .replace(KEY_RE, "[KEY_REDACTED]")
    );
  }

  if (typeof obj !== "object" || obj === null) {
    return obj;
  }

  const redacted: Record<string, unknown> | unknown[] = Array.isArray(obj)
    ? []
    : {};
  const sensitiveKeys = [
    "email",
    "password",
    "token",
    "apikey",
    "api_key",
    "secret",
    "ssn",
    "creditcard",
    "credit_card",
    "phone",
    "address",
  ];

  for (const [key, value] of Object.entries(obj)) {
    // Redact entire value if key is sensitive
    if (sensitiveKeys.some((s) => key.toLowerCase().includes(s))) {
      (redacted as Record<string, unknown>)[key] = "[REDACTED]";
    }
    // Recursively redact nested objects
    else if (typeof value === "object" && value !== null) {
      (redacted as Record<string, unknown>)[key] = redactSensitiveData(value);
    }
    // Redact long strings (likely to be prompts with PII)
    else if (typeof value === "string" && value.length > 1000) {
      const redactedValue = redactSensitiveData(value);
      (redacted as Record<string, unknown>)[key] =
        (redactedValue as string).substring(0, 200) +
        `... [${value.length - 200} chars truncated]`;
    }
    // Redact patterns in short strings
    else if (typeof value === "string") {
      (redacted as Record<string, unknown>)[key] = redactSensitiveData(value);
    } else {
      (redacted as Record<string, unknown>)[key] = value;
    }
  }

  return redacted;
}

/**
 * Global error handling middleware
 * Catches and formats errors consistently with sensitive data redaction
 */
type RequestWithId = Request & { id?: string; body?: Record<string, unknown> };

function toDetailsString(value: unknown): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value === "string") {
    return value;
  }

  try {
    const redacted = redactSensitiveData(value);
    return JSON.stringify(redacted);
  } catch {
    return String(value);
  }
}

export function errorHandler(
  err: unknown,
  req: RequestWithId,
  res: Response,
  _next: NextFunction,
): void {
  const meta: Record<string, unknown> = {
    requestId: req.id,
    method: req.method,
    path: req.path,
  };

  if (req.body && Object.keys(req.body).length > 0) {
    try {
      const redactedBody = redactSensitiveData(req.body);
      const bodyStr = JSON.stringify(redactedBody);
      meta.bodyPreview = bodyStr.substring(0, 300);
      meta.bodyLength = JSON.stringify(req.body).length;
    } catch {
      // ignore serialization errors
    }
  }

  // Retry-able 503s: ConcurrencyLimiter backpressure (QUEUE_FULL/QUEUE_TIMEOUT,
  // propagated from LLMClient) and the fail-closed rate limiter
  // (RATE_LIMIT_UNAVAILABLE, raised when the Redis-backed store is unhealthy so
  // LLM routes reject rather than silently degrade to per-instance limits).
  //
  // All three answer the same question — "come back later" — so they share one
  // branch and one envelope. The retry hint travels in the `Retry-After`
  // header, which is both the HTTP-standard channel and the only one the client
  // reads (client/src/services/http/FetchHttpTransport.ts).
  if (typeof err === "object" && err !== null && "code" in err) {
    const retryableErr = err as {
      code?: unknown;
      retryAfter?: unknown;
      message?: unknown;
    };
    const code = retryableErr.code;
    if (
      code === "QUEUE_FULL" ||
      code === "QUEUE_TIMEOUT" ||
      code === "RATE_LIMIT_UNAVAILABLE"
    ) {
      const retryAfter =
        typeof retryableErr.retryAfter === "number" &&
        Number.isFinite(retryableErr.retryAfter) &&
        retryableErr.retryAfter > 0
          ? retryableErr.retryAfter
          : 5;
      const message =
        typeof retryableErr.message === "string" &&
        retryableErr.message.length > 0
          ? retryableErr.message
          : code === "QUEUE_FULL"
            ? "Service is busy. Please retry shortly."
            : code === "QUEUE_TIMEOUT"
              ? "Request timed out waiting in queue. Please retry shortly."
              : "Rate limiter temporarily unavailable, please retry.";

      logger.warn(
        code === "RATE_LIMIT_UNAVAILABLE"
          ? "Rate limiter unavailable"
          : "Concurrency backpressure",
        { ...meta, errorCode: code, retryAfter },
      );

      res.setHeader("Retry-After", String(retryAfter));
      respond.fail(res, req, 503, { error: message, code });
      return;
    }
  }

  // Handle any DomainError subclass (ConvergenceError, VideoProviderError, etc.)
  if (isDomainError(err)) {
    const statusCode = err.getHttpStatus();
    const userMessage = err.getUserMessage();
    const details = toDetailsString(err.details);

    logger.warn(`${err.name}`, {
      ...meta,
      errorCode: err.code,
      statusCode,
      details,
    });

    // DomainError.code is `string`, so this cast is the one place an
    // undeclared code can still reach the wire. Every code a DomainError
    // subclass currently emits is declared in ApiErrorCode; if a new one is
    // added, declare it there too or the client's z.enum(API_ERROR_CODES)
    // rejects the response.
    respond.fail(res, req, statusCode, {
      error: userMessage,
      code: err.code as ApiErrorCode,
      ...(details ? { details } : {}),
    });
    return;
  }

  const errorObj = err instanceof Error ? err : new Error(String(err));
  logger.error("Request error", errorObj, meta);

  const httpErr = err as Record<string, unknown>;
  const statusCode =
    (typeof httpErr === "object" && httpErr !== null
      ? ((httpErr.statusCode as number) ?? (httpErr.status as number))
      : undefined) ?? 500;
  const details =
    typeof httpErr === "object" && httpErr !== null && "details" in httpErr
      ? toDetailsString(httpErr.details)
      : undefined;
  const code =
    typeof httpErr === "object" &&
    httpErr !== null &&
    typeof httpErr.code === "string"
      ? (httpErr.code as ApiErrorCode)
      : undefined;

  respond.fail(res, req, statusCode, {
    error: errorObj.message || "Internal server error",
    ...(code ? { code } : {}),
    ...(details ? { details } : {}),
  });
}
