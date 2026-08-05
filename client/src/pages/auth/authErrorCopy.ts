/**
 * The auth surface's error vocabulary — every Firebase code the creator can
 * reach, in one table.
 *
 * This used to be six near-identical `switch` statements, one per page, each
 * deciding independently which codes were worth naming. Copy stayed in sync by
 * luck, and coverage did not: `auth/network-request-failed` was named on one
 * page out of five, so signing in with no connection said "Something went
 * wrong" instead of what actually happened.
 *
 * Shape: a code resolves against the flow's own overrides first, then the
 * shared table, then the flow's fallback. Most copy is shared; the exceptions
 * are the flows that must name what the creator was doing ("sign-up" vs
 * "sign-in") or what kind of link failed.
 */

/** Which page-level operation produced the error. Picks the fallback copy. */
export type AuthFlow =
  | "signIn"
  | "signUp"
  | "forgotPassword"
  | "passwordReset"
  | "verifyEmail"
  | "resendVerification";

/** How the creator authenticated. Only `auth/operation-not-allowed` reads it. */
export type AuthProvider = "google" | "email";

/** Codes whose copy is the same wherever they surface. */
const SHARED: Readonly<Record<string, string>> = {
  "auth/invalid-email": "Enter a valid email address.",
  "auth/user-disabled": "This account is disabled.",
  "auth/weak-password": "Password is too weak. Use at least 6 characters.",
  "auth/too-many-requests": "Too many attempts. Try again in a bit.",
  "auth/network-request-failed":
    "Network error. Check your connection and try again.",
  "auth/popup-blocked":
    "Google popup was blocked. Allow popups for this tab and try again.",
  "auth/cancelled-popup-request":
    "Google sign-in popup request was cancelled. Try again.",
  "auth/unauthorized-domain":
    "This localhost domain is not authorized in Firebase Auth settings.",
};

const GOOGLE_PROVIDER_DISABLED =
  "Google sign-in is disabled in Firebase Auth. Enable the Google provider in the Firebase console.";

const SIGN_IN_EMBEDDED =
  "Google sign-in is not supported in this embedded browser. Use email sign-in here or open the app in a regular browser.";

const SIGN_UP_EMBEDDED =
  "Google sign-in is not supported in this embedded browser. Use email sign-up here or open the app in a regular browser.";

/** Where a flow must say something the shared table cannot. */
const OVERRIDES: Readonly<Record<AuthFlow, Readonly<Record<string, string>>>> =
  {
    signIn: {
      "auth/user-not-found": "Incorrect email or password.",
      "auth/wrong-password": "Incorrect email or password.",
      "auth/invalid-credential": "Incorrect email or password.",
      "auth/invalid-login-credentials": "Incorrect email or password.",
      "auth/popup-closed-by-user":
        "Google popup was closed before sign-in completed.",
      "auth/operation-not-supported-in-this-environment": SIGN_IN_EMBEDDED,
      "auth/web-storage-unsupported": SIGN_IN_EMBEDDED,
    },
    signUp: {
      "auth/email-already-in-use":
        "That email is already in use. Try signing in instead.",
      "auth/popup-closed-by-user":
        "Google popup was closed before sign-up completed.",
      "auth/cancelled-popup-request":
        "Google sign-up popup request was cancelled. Try again.",
      "auth/operation-not-supported-in-this-environment": SIGN_UP_EMBEDDED,
      "auth/web-storage-unsupported": SIGN_UP_EMBEDDED,
    },
    forgotPassword: {
      "auth/user-not-found": "No account found for that email.",
      "auth/unauthorized-continue-uri":
        "Password reset links aren't configured for this domain yet.",
      "auth/invalid-continue-uri":
        "Password reset links aren't configured for this domain yet.",
      "auth/missing-continue-uri":
        "Password reset links aren't configured for this domain yet.",
    },
    passwordReset: {
      "auth/invalid-action-code": "That reset link is invalid or already used.",
      "auth/expired-action-code":
        "That reset link has expired. Request a new one.",
    },
    verifyEmail: {
      "auth/invalid-action-code":
        "That verification link is invalid or already used.",
      "auth/expired-action-code":
        "That verification link has expired. Request a new one.",
    },
    resendVerification: {
      "auth/too-many-requests": "Too many emails sent. Try again later.",
      "auth/unauthorized-continue-uri":
        "Email verification links aren't configured for this domain yet.",
      "auth/invalid-continue-uri":
        "Email verification links aren't configured for this domain yet.",
      "auth/missing-continue-uri":
        "Email verification links aren't configured for this domain yet.",
    },
  };

/** What to say when the code is unrecognised — names the attempted action. */
const FALLBACK: Readonly<Record<AuthFlow, string>> = {
  signIn: "Failed to sign in. Please try again.",
  signUp: "Failed to create account. Please try again.",
  forgotPassword: "Failed to send reset email. Please try again.",
  passwordReset: "Failed to reset password. Please try again.",
  verifyEmail: "Failed to verify email. Please try again.",
  resendVerification: "Failed to resend verification email. Please try again.",
};

/** What to say when the thrown value is not shaped like an auth error at all. */
const NOT_AN_ERROR = "Something went wrong. Please try again.";

/**
 * Read the Firebase error code off a thrown value.
 *
 * `AuthRepositoryError` re-exposes the wrapped provider code as `.code`, so
 * both the raw SDK error and the repository's wrapper resolve here.
 */
function errorCode(error: unknown): string | null {
  if (!error || typeof error !== "object") return null;
  return "code" in error && typeof error.code === "string" ? error.code : null;
}

export function authErrorCopy(
  error: unknown,
  flow: AuthFlow,
  provider?: AuthProvider,
): string {
  if (!error || typeof error !== "object") return NOT_AN_ERROR;
  const code = errorCode(error);
  if (!code) return FALLBACK[flow];

  if (code === "auth/operation-not-allowed") {
    if (provider === "google") return GOOGLE_PROVIDER_DISABLED;
    return flow === "signUp"
      ? "Email/password sign-up is disabled in Firebase Auth."
      : "Email/password sign-in is disabled in Firebase Auth.";
  }

  return OVERRIDES[flow][code] ?? SHARED[code] ?? FALLBACK[flow];
}
