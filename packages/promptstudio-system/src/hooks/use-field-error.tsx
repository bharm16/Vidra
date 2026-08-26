import * as React from "react";

interface UseFieldErrorOptions {
  id?: string | undefined;
  name?: string | undefined;
  error?: boolean | undefined;
  errorMessage?: string | undefined;
}

interface UseFieldError {
  /** Spread onto the control element (input/textarea). */
  invalidProps: {
    "aria-invalid": true | undefined;
    "aria-describedby": string | undefined;
  };
  /** Error-state border classes for the control, or undefined when valid. */
  errorClassName: string | undefined;
  /** The rendered error message node, or null when there is nothing to show. */
  errorNode: React.ReactNode;
}

/**
 * The shared "error field" contract for text controls (Input, Textarea).
 *
 * Centralises the error-id convention (`{id ?? name}-error`), the invalid ARIA
 * wiring, the error-state border classes, and the error-message node so the
 * field controls stay consistent by construction instead of copy-paste.
 */
export function useFieldError({
  id,
  name,
  error,
  errorMessage,
}: UseFieldErrorOptions): UseFieldError {
  const errorId = `${id ?? name}-error`;
  const showError = Boolean(error && errorMessage);
  return {
    invalidProps: {
      "aria-invalid": error || undefined,
      "aria-describedby": showError ? errorId : undefined,
    },
    errorClassName: error
      ? "border-danger focus-visible:border-danger"
      : undefined,
    errorNode: showError ? (
      <p id={errorId} className="text-label-sm text-danger" role="alert">
        {errorMessage}
      </p>
    ) : null,
  };
}
