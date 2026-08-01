import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuthUser } from "@hooks/useAuthUser";

interface RequireAuthProps {
  children: React.ReactElement;
}

/**
 * Route guard for account-scoped surfaces (Library, Account, Live editor,
 * Studio): they render one creator's own work, so a signed-out visitor is
 * sent to sign-in with a way back (SignInPage honors ?redirect=). The
 * workspace at "/" deliberately stays guest-reachable — its gate is the
 * "Sign in to make it" modal at submit time. Without this guard the pages
 * rendered for guests and every account-scoped call failed raw: Studio
 * submits 401'd and live-editor strokes died silently in production, while
 * the dev API-key fallback masked all of it locally.
 *
 * Renders nothing until the initial auth state lands — redirecting before
 * resolution would bounce every signed-in hard load through /signin.
 */
export function RequireAuth({
  children,
}: RequireAuthProps): React.ReactElement | null {
  const [isAuthResolved, setIsAuthResolved] = React.useState(false);
  const user = useAuthUser({
    onChange: () => {
      setIsAuthResolved(true);
    },
  });
  const location = useLocation();

  if (!isAuthResolved) return null;
  if (!user) {
    const redirect = encodeURIComponent(
      `${location.pathname}${location.search}`,
    );
    return <Navigate to={`/signin?redirect=${redirect}`} replace />;
  }
  return children;
}
