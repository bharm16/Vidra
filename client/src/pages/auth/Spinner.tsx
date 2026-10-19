import React from "react";
import "./fresh-auth.css";

/**
 * The auth surface's pending affordance — one copy, not one per page.
 *
 * Uses the exact retained Button / Loading glyph at its intrinsic 14px size.
 * Mask colour follows the caller's text context for Primary and Secondary.
 */
export function Spinner(): React.ReactElement {
  return <span className="vf-auth-loading" aria-hidden="true" />;
}
