import React from "react";
import { Navigate, useParams } from "react-router-dom";

/**
 * Redirect shim for legacy session-scoped paths. React Router's <Navigate>
 * does not interpolate ":params" in its `to` string, so redirect routes that
 * carry a :sessionId must read the param and build the target themselves.
 */
export function SessionPathRedirect(): React.JSX.Element {
  const { sessionId } = useParams();
  return <Navigate to={sessionId ? `/session/${sessionId}` : "/"} replace />;
}
