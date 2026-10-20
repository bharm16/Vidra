/**
 * Frontend Logging Helpers
 *
 * @module utils/logging/sanitize
 */

/**
 * Normalize an unknown thrown value into loggable error fields
 *
 * @param error - Error object
 * @returns Error message, name and stack
 */
export function sanitizeError(error: Error | unknown): {
  message: string;
  name?: string;
  stack?: string;
} {
  if (!(error instanceof Error)) {
    return {
      message: String(error),
    };
  }

  const result: { message: string; name?: string; stack?: string } = {
    message: error.message,
  };

  if (error.name) {
    result.name = error.name;
  }

  if (error.stack) {
    result.stack = error.stack;
  }

  return result;
}
