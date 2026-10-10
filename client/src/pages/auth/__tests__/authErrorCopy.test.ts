import { describe, expect, it } from "vitest";
import { authErrorCopy } from "../authErrorCopy";

const err = (code: string): { code: string } => ({ code });

/**
 * The auth surface's error vocabulary. Previously six per-page `switch`
 * statements covering 44 cases between them, reachable only by mounting a
 * page — so a code's copy could only be checked through a rendered DOM.
 */
describe("authErrorCopy", () => {
  it("names the attempted action when the code is unrecognised", () => {
    expect(authErrorCopy(err("auth/nonsense"), "signIn")).toBe(
      "Failed to sign in. Please try again.",
    );
    expect(authErrorCopy(err("auth/nonsense"), "signUp")).toBe(
      "Failed to create account. Please try again.",
    );
    expect(authErrorCopy(err("auth/nonsense"), "resendVerification")).toBe(
      "Failed to resend verification email. Please try again.",
    );
  });

  it("says something generic when the thrown value is not an object", () => {
    for (const thrown of [null, undefined, "boom", 42]) {
      expect(authErrorCopy(thrown, "signIn")).toBe(
        "Something went wrong. Please try again.",
      );
    }
  });

  it("lets a flow override a shared code", () => {
    expect(authErrorCopy(err("auth/too-many-requests"), "signIn")).toBe(
      "Too many attempts. Try again in a bit.",
    );
    expect(
      authErrorCopy(err("auth/too-many-requests"), "resendVerification"),
    ).toBe("Too many emails sent. Try again later.");
  });

  it("names the link kind that failed", () => {
    expect(
      authErrorCopy(err("auth/expired-action-code"), "passwordReset"),
    ).toBe("That reset link has expired. Request a new one.");
    expect(authErrorCopy(err("auth/expired-action-code"), "verifyEmail")).toBe(
      "That verification link has expired. Request a new one.",
    );
  });

  it("distinguishes a disabled provider from a disabled method", () => {
    const code = err("auth/operation-not-allowed");
    expect(authErrorCopy(code, "signIn", "google")).toContain(
      "Google sign-in is disabled",
    );
    expect(authErrorCopy(code, "signIn", "email")).toBe(
      "Email/password sign-in is disabled in Firebase Auth.",
    );
    expect(authErrorCopy(code, "signUp", "email")).toBe(
      "Email/password sign-up is disabled in Firebase Auth.",
    );
  });

  it("treats a bad credential as one message, whichever code arrives", () => {
    for (const code of [
      "auth/user-not-found",
      "auth/wrong-password",
      "auth/invalid-credential",
      "auth/invalid-login-credentials",
    ]) {
      expect(authErrorCopy(err(code), "signIn")).toBe(
        "Incorrect email or password.",
      );
    }
  });

  /**
   * The asymmetry the duplication produced: only the resend mapper named
   * `auth/network-request-failed`, so a dropped connection on the other four
   * flows reported the generic failure instead of the cause.
   */
});
