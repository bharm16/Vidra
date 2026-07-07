/**
 * Auth Gate Controller
 *
 * A framework-agnostic singleton that mediates "you must be signed in to
 * continue" moments across two entry points:
 *
 *  - The HTTP layer (global 401 handler, {@link ../../services/http/AuthRetryTransport}).
 *  - The composer's primary "Make it" action (auth-at-Go).
 *
 * Both entry points call {@link requestAuth} with a `resume` callback. The
 * `<AuthGateDialog />` subscribes via {@link subscribe}, renders the sign-in
 * dialog, and — once auth succeeds — calls {@link resolveAuthenticated} to run
 * the pending resume. If the user dismisses the dialog, {@link cancelPending}
 * rejects the request so callers can abandon the pending action.
 *
 * The controller owns no React and no Firebase; it is a decision + pub/sub
 * seam, which keeps the resume logic unit-testable in isolation.
 */

export type AuthGateReason = "http-401" | "pre-go";

export interface AuthGateRequest {
  /** Why the gate opened — drives dialog copy. */
  reason: AuthGateReason;
}

/** Resolution outcome delivered back to {@link requestAuth} callers. */
export type AuthGateOutcome = "authenticated" | "cancelled";

type Listener = (request: AuthGateRequest | null) => void;

interface PendingEntry {
  request: AuthGateRequest;
  resolve: (outcome: AuthGateOutcome) => void;
}

export class AuthGateController {
  private listeners = new Set<Listener>();
  private pending: PendingEntry | null = null;

  /**
   * Open the auth gate. Resolves with `"authenticated"` once the dialog
   * reports a successful sign-in, or `"cancelled"` if the user dismisses it.
   *
   * Concurrent requests coalesce onto the first pending entry: a 401 storm (or
   * a 401 arriving while the pre-Go dialog is already open) surfaces a single
   * dialog, and every caller resolves together when auth completes. The
   * reason of the first (already-open) request wins.
   */
  requestAuth(request: AuthGateRequest): Promise<AuthGateOutcome> {
    if (this.pending) {
      const existing = this.pending;
      return new Promise<AuthGateOutcome>((resolve) => {
        const previousResolve = existing.resolve;
        existing.resolve = (outcome) => {
          previousResolve(outcome);
          resolve(outcome);
        };
      });
    }

    return new Promise<AuthGateOutcome>((resolve) => {
      this.pending = { request, resolve };
      this.emit(request);
    });
  }

  /** Whether a gate request is currently open. */
  isPending(): boolean {
    return this.pending !== null;
  }

  /** The active request, or null when the gate is closed. */
  activeRequest(): AuthGateRequest | null {
    return this.pending?.request ?? null;
  }

  /**
   * Report that authentication succeeded. Resolves the pending request with
   * `"authenticated"` and closes the gate. No-op when nothing is pending.
   */
  resolveAuthenticated(): void {
    this.settle("authenticated");
  }

  /**
   * Report that the user dismissed the dialog without signing in. Resolves the
   * pending request with `"cancelled"` and closes the gate.
   */
  cancelPending(): void {
    this.settle("cancelled");
  }

  /** Subscribe to open/close transitions. Returns an unsubscribe function. */
  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private settle(outcome: AuthGateOutcome): void {
    const entry = this.pending;
    if (!entry) return;
    this.pending = null;
    this.emit(null);
    entry.resolve(outcome);
  }

  private emit(request: AuthGateRequest | null): void {
    this.listeners.forEach((listener) => listener(request));
  }
}

/** Process-wide singleton shared by the HTTP layer and the composer. */
export const authGateController = new AuthGateController();
