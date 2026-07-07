import type { AuthGateController, AuthGateReason } from "./authGateController";

/**
 * Gate an action behind authentication (auth-at-Go).
 *
 * If a user is already signed in, `action` runs immediately. Otherwise the
 * auth gate opens and `action` runs only after a successful sign-in; if the
 * user cancels, `action` never runs. Extracted as a pure helper (the
 * controller is injected) so the pre-Go decision is unit-testable without
 * React or Firebase.
 */
export async function runWhenAuthenticated(deps: {
  isAuthenticated: boolean;
  reason: AuthGateReason;
  authGate: Pick<AuthGateController, "requestAuth">;
  action: () => void;
}): Promise<void> {
  const { isAuthenticated, reason, authGate, action } = deps;

  if (isAuthenticated) {
    action();
    return;
  }

  const outcome = await authGate.requestAuth({ reason });
  if (outcome === "authenticated") {
    action();
  }
}
