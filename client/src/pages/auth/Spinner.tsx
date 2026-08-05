import React from "react";

/**
 * The auth surface's pending affordance — one copy, not one per page.
 *
 * Sized and coloured from the caller's text context (`currentColor`,
 * `h-4 w-4`), so it inherits whatever it sits inside and adds no colour of
 * its own (ADR-0008).
 */
export function Spinner(): React.ReactElement {
  return (
    <svg
      className="h-4 w-4 animate-spin"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}
