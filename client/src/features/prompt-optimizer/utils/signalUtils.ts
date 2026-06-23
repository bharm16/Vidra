/**
 * Signal utilities for request cancellation management.
 * Provides consistent handling of AbortSignals and cancellation errors.
 *
 * @module signalUtils
 */

/**
 * Custom error class for request cancellation.
 * Allows distinguishing cancellation from other errors.
 *
 * @example
 * ```typescript
 * try {
 *   await fetchData(signal);
 * } catch (error) {
 *   if (error instanceof CancellationError) {
 *     // Silent return - don't update state
 *     return;
 *   }
 *   // Handle other errors
 * }
 * ```
 */
export class CancellationError extends Error {
  readonly isCancellation = true;

  constructor(message: string = "Request cancelled") {
    super(message);
    this.name = "CancellationError";
    // Maintains proper stack trace for where error was thrown (V8 engines)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, CancellationError);
    }
  }
}

/**
 * Type guard to check if an error is a CancellationError.
 *
 * @param error - The error to check
 * @returns True if the error is a CancellationError
 */
export function isCancellationError(
  error: unknown,
): error is CancellationError {
  return (
    error instanceof CancellationError ||
    (error instanceof Error &&
      "isCancellation" in error &&
      (error as CancellationError).isCancellation === true)
  );
}

/**
 * Combine multiple AbortSignals into one.
 * The combined signal aborts when ANY input signal aborts.
 *
 * @param signals - AbortSignals to combine
 * @returns A new AbortSignal that aborts when any input signal aborts
 *
 * @example
 * ```typescript
 * const timeoutController = new AbortController();
 * setTimeout(() => timeoutController.abort(), 3000);
 *
 * const userController = new AbortController();
 *
 * const combinedSignal = combineSignals(
 *   timeoutController.signal,
 *   userController.signal
 * );
 *
 * // combinedSignal will abort if either timeout or user cancels
 * await fetch(url, { signal: combinedSignal });
 * ```
 */
export function combineSignals(...signals: AbortSignal[]): AbortSignal {
  return AbortSignal.any(signals);
}
