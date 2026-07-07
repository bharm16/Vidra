/**
 * AuthRetryTransport — Global 401 handler (M4, ADR-0010).
 *
 * Wraps the underlying HTTP transport so that a single seam handles every
 * `401 Unauthorized`: it opens the app's auth dialog (via
 * {@link AuthGateController}) and, once the user signs in, transparently
 * retries the original request exactly once with freshly-minted auth headers.
 *
 * This is the ONLY place 401 is turned into a sign-in prompt — call sites stay
 * unaware. Drafts survive the round-trip because they already persist to
 * localStorage and merge on login (see
 * `features/prompt-optimizer/PromptCanvas/hooks/useHistoryPersistence.ts`).
 *
 * Retry contract:
 *  - Only unauthenticated 401s trigger it. If the user was already signed in
 *    (a token that the server rejected), re-authing wouldn't change the
 *    outcome, so we surface the 401 unchanged and avoid a sign-in loop.
 *  - At most one retry per request. The retried response is returned as-is,
 *    even if it is itself a 401, so downstream error handling is unchanged.
 *  - If the user cancels the dialog, the original 401 response is returned.
 */

import type { AuthGateController } from "@/features/auth-gate/authGateController";

export interface HttpTransport {
  send(url: string, init: RequestInit): Promise<Response>;
}

export interface AuthRetryDeps {
  transport: HttpTransport;
  authGate: Pick<AuthGateController, "requestAuth">;
  /** True when a user is currently signed in. */
  isAuthenticated: () => boolean;
  /** Rebuild auth headers (e.g. a fresh Firebase ID token) for the retry. */
  buildAuthHeaders: () => Promise<Record<string, string>>;
}

const UNAUTHORIZED = 401;

/**
 * Decide whether a response should trigger the sign-in-and-retry flow.
 *
 * Pure and exported for unit tests: retry only when the status is 401 AND no
 * user is currently authenticated (an authenticated 401 means the token was
 * rejected for reasons re-login won't fix).
 */
export function shouldTriggerAuthRetry(
  response: Response,
  isAuthenticated: boolean,
): boolean {
  return response.status === UNAUTHORIZED && !isAuthenticated;
}

/** Merge freshly-built auth headers onto the retry request's init. */
function withAuthHeaders(
  init: RequestInit,
  authHeaders: Record<string, string>,
): RequestInit {
  const headers = new Headers(init.headers);
  for (const [key, value] of Object.entries(authHeaders)) {
    headers.set(key, value);
  }
  return {
    ...init,
    headers: Object.fromEntries(headers.entries()),
  };
}

export class AuthRetryTransport implements HttpTransport {
  private readonly transport: HttpTransport;
  private readonly authGate: Pick<AuthGateController, "requestAuth">;
  private readonly isAuthenticated: () => boolean;
  private readonly buildAuthHeaders: () => Promise<Record<string, string>>;

  constructor(deps: AuthRetryDeps) {
    this.transport = deps.transport;
    this.authGate = deps.authGate;
    this.isAuthenticated = deps.isAuthenticated;
    this.buildAuthHeaders = deps.buildAuthHeaders;
  }

  async send(url: string, init: RequestInit): Promise<Response> {
    const response = await this.transport.send(url, init);

    if (!shouldTriggerAuthRetry(response, this.isAuthenticated())) {
      return response;
    }

    const outcome = await this.authGate.requestAuth({ reason: "http-401" });
    if (outcome !== "authenticated") {
      return response;
    }

    const authHeaders = await this.buildAuthHeaders();
    return this.transport.send(url, withAuthHeaders(init, authHeaders));
  }
}
