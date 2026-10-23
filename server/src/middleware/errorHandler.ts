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
export const INTERNAL_ERROR_MESSAGE = "Something went wrong on our side. Try again.";

/**
 * Whether a non-domain error's own message may reach the client. Server failures and
 * provider errors (whose status is the provider's, e.g. a 429 quota body) stay internal.
 */
export function exposesErrorMessage(error: unknown, statusCode: number): boolean {
  return statusCode < 500 && !(error instanceof Error && error.name === "APIError");
}

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
    "datauri",
    "instructions",
    "prompt",
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
  req: Request,
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

  // An unexpected server failure is logged in full above; its message and details
  // (store errors, provider bodies, console links) never reach the client.
  if (!exposesErrorMessage(err, statusCode)) {
    respond.fail(res, req, statusCode, { error: INTERNAL_ERROR_MESSAGE, ...(code ? { code } : {}) });
    return;
  }

  respond.fail(res, req, statusCode, {
    error: errorObj.message || INTERNAL_ERROR_MESSAGE,
    ...(code ? { code } : {}),
    ...(details ? { details } : {}),
  });
}
