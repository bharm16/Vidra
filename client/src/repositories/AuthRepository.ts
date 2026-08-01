/**
 * AuthRepository - Data Access Layer for Authentication
 *
 * Abstracts all authentication-related operations
 * This allows us to:
 * - Swap auth providers (Firebase, Auth0, etc.) without changing business logic
 * - Mock authentication for testing
 * - Centralize auth logic
 */

import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  signInWithPopup,
  signInWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  sendEmailVerification,
  applyActionCode,
  verifyPasswordResetCode,
  confirmPasswordReset,
  updateProfile,
  onAuthStateChanged as firebaseOnAuthStateChanged,
  type Auth,
  type User as FirebaseUser,
} from "firebase/auth";
import type { User } from "../hooks/types";
import { logger } from "@/services/LoggingService";
import { sanitizeError } from "@/utils/logging";

const log = logger.child("AuthRepository");

/**
 * User-scoped local state must not survive sign-out: the next visitor on
 * this browser is a guest (or a different user), and the local history
 * mirror and persisted logs carry the previous user's content — session
 * titles, prompts, media references. Firebase clears its own auth
 * persistence in signOut(); everything the app wrote is cleared here.
 * Runs only after the provider sign-out succeeds — a failed sign-out
 * leaves the still-signed-in user's state alone.
 */
async function clearUserScopedLocalState(): Promise<void> {
  const { LocalStoragePromptRepository } = await import(
    "./LocalStoragePromptRepository"
  );
  await new LocalStoragePromptRepository().clear();
  logger.clearStoredLogs();
}

export interface SentryIntegration {
  setUser: (user: User | null) => void;
  addBreadcrumb: (
    category: string,
    message: string,
    data?: Record<string, unknown>,
  ) => void;
}

/**
 * Repository for managing authentication
 */
export class AuthRepository {
  private auth: Auth;
  private sentry: SentryIntegration | null;
  private googleProvider: GoogleAuthProvider;

  constructor(auth: Auth, sentryIntegration: SentryIntegration | null = null) {
    this.auth = auth;
    this.sentry = sentryIntegration;
    this.googleProvider = new GoogleAuthProvider();
  }

  /**
   * Sign in with Google
   */
  async signInWithGoogle(): Promise<User> {
    try {
      const result = await signInWithPopup(this.auth, this.googleProvider);

      // Update Sentry user context if integration is provided
      if (this.sentry) {
        const mappedUser = this._mapFirebaseUser(result.user);
        this.sentry.setUser(mappedUser);
        this.sentry.addBreadcrumb("auth", "User signed in with Google", {
          userId: result.user.uid,
        });
      }

      return this._mapFirebaseUser(result.user);
    } catch (error) {
      const errObj =
        error instanceof Error
          ? error
          : new Error(sanitizeError(error).message);
      log.error("Error signing in with Google", errObj, {
        operation: "signInWithGoogle",
      });
      throw new AuthRepositoryError("Failed to sign in with Google", error);
    }
  }

  /**
   * Sign in with email + password
   */
  async signInWithEmail(email: string, password: string): Promise<User> {
    try {
      const result = await signInWithEmailAndPassword(
        this.auth,
        email,
        password,
      );

      if (this.sentry) {
        const mappedUser = this._mapFirebaseUser(result.user);
        this.sentry.setUser(mappedUser);
        this.sentry.addBreadcrumb("auth", "User signed in with email", {
          userId: result.user.uid,
        });
      }

      return this._mapFirebaseUser(result.user);
    } catch (error) {
      const errObj =
        error instanceof Error
          ? error
          : new Error(sanitizeError(error).message);
      log.error("Error signing in with email", errObj, {
        operation: "signInWithEmail",
      });
      throw new AuthRepositoryError("Failed to sign in with email", error);
    }
  }

  /**
   * Sign up with email + password
   */
  async signUpWithEmail(
    email: string,
    password: string,
    displayName?: string,
  ): Promise<User> {
    try {
      const result = await createUserWithEmailAndPassword(
        this.auth,
        email,
        password,
      );

      const normalizedName =
        typeof displayName === "string" ? displayName.trim() : "";
      if (normalizedName) {
        await updateProfile(result.user, { displayName: normalizedName });
      }

      if (this.sentry) {
        const mappedUser = this._mapFirebaseUser(result.user);
        this.sentry.setUser(mappedUser);
        this.sentry.addBreadcrumb("auth", "User signed up with email", {
          userId: result.user.uid,
        });
      }

      return this._mapFirebaseUser(result.user);
    } catch (error) {
      const errObj =
        error instanceof Error
          ? error
          : new Error(sanitizeError(error).message);
      log.error("Error signing up with email", errObj, {
        operation: "signUpWithEmail",
      });
      throw new AuthRepositoryError("Failed to sign up with email", error);
    }
  }

  /**
   * Send a password reset email
   */
  async sendPasswordReset(email: string, redirectPath?: string): Promise<void> {
    try {
      const actionCodeSettings = this._getActionCodeSettings(
        "/reset-password",
        redirectPath,
      );
      if (actionCodeSettings) {
        await sendPasswordResetEmail(this.auth, email, actionCodeSettings);
      } else {
        await sendPasswordResetEmail(this.auth, email);
      }
      if (this.sentry) {
        this.sentry.addBreadcrumb("auth", "Password reset email requested");
      }
    } catch (error) {
      const errObj =
        error instanceof Error
          ? error
          : new Error(sanitizeError(error).message);
      log.error("Error sending password reset email", errObj, {
        operation: "sendPasswordReset",
      });
      throw new AuthRepositoryError(
        "Failed to send password reset email",
        error,
      );
    }
  }

  /**
   * Send an email verification link to the current user
   */
  async sendVerificationEmail(redirectPath?: string): Promise<void> {
    try {
      const currentUser = this.auth.currentUser;
      if (!currentUser) {
        throw new AuthRepositoryError("No authenticated user to verify", null);
      }

      const actionCodeSettings = this._getActionCodeSettings(
        "/email-verification",
        redirectPath,
      );
      if (actionCodeSettings) {
        await sendEmailVerification(currentUser, actionCodeSettings);
      } else {
        await sendEmailVerification(currentUser);
      }

      if (this.sentry) {
        this.sentry.addBreadcrumb("auth", "Verification email requested", {
          userId: currentUser.uid,
        });
      }
    } catch (error) {
      const errObj =
        error instanceof Error
          ? error
          : new Error(sanitizeError(error).message);
      log.error("Error sending verification email", errObj, {
        operation: "sendVerificationEmail",
      });
      throw new AuthRepositoryError("Failed to send verification email", error);
    }
  }

  /**
   * Apply an email verification code from an email action link
   */
  async verifyEmailWithCode(oobCode: string): Promise<void> {
    try {
      await applyActionCode(this.auth, oobCode);
      if (this.sentry) {
        this.sentry.addBreadcrumb("auth", "Email verified via action code");
      }
    } catch (error) {
      const errObj =
        error instanceof Error
          ? error
          : new Error(sanitizeError(error).message);
      log.error("Error verifying email with action code", errObj, {
        operation: "verifyEmailWithCode",
      });
      throw new AuthRepositoryError("Failed to verify email", error);
    }
  }

  /**
   * Validate a password reset code and return the email address it is for
   */
  async validatePasswordResetCode(oobCode: string): Promise<string> {
    try {
      return await verifyPasswordResetCode(this.auth, oobCode);
    } catch (error) {
      const errObj =
        error instanceof Error
          ? error
          : new Error(sanitizeError(error).message);
      log.error("Error validating password reset code", errObj, {
        operation: "validatePasswordResetCode",
      });
      throw new AuthRepositoryError(
        "Invalid or expired password reset link",
        error,
      );
    }
  }

  /**
   * Confirm a password reset using the code from the email link
   */
  async confirmPasswordResetWithCode(
    oobCode: string,
    newPassword: string,
  ): Promise<void> {
    try {
      await confirmPasswordReset(this.auth, oobCode, newPassword);
      if (this.sentry) {
        this.sentry.addBreadcrumb(
          "auth",
          "Password reset confirmed via action code",
        );
      }
    } catch (error) {
      const errObj =
        error instanceof Error
          ? error
          : new Error(sanitizeError(error).message);
      log.error("Error confirming password reset", errObj, {
        operation: "confirmPasswordResetWithCode",
      });
      throw new AuthRepositoryError("Failed to reset password", error);
    }
  }

  /**
   * Force-refresh the current user so fields like emailVerified are up to date
   */
  async refreshCurrentUser(): Promise<User | null> {
    const currentUser = this.auth.currentUser;
    if (!currentUser) return null;

    try {
      await currentUser.reload();
      const mapped = this._mapFirebaseUser(currentUser);
      if (this.sentry) {
        this.sentry.setUser(mapped);
      }
      return mapped;
    } catch (error) {
      const errObj =
        error instanceof Error
          ? error
          : new Error(sanitizeError(error).message);
      log.error("Error refreshing current user", errObj, {
        operation: "refreshCurrentUser",
      });
      throw new AuthRepositoryError("Failed to refresh user", error);
    }
  }

  /**
   * Sign out the current user
   */
  async signOut(): Promise<void> {
    try {
      await signOut(this.auth);
      await clearUserScopedLocalState();

      // Clear Sentry user context if integration is provided
      if (this.sentry) {
        this.sentry.setUser(null);
        this.sentry.addBreadcrumb("auth", "User signed out");
      }
    } catch (error) {
      const errObj =
        error instanceof Error
          ? error
          : new Error(sanitizeError(error).message);
      log.error("Error signing out", errObj, { operation: "signOut" });
      throw new AuthRepositoryError("Failed to sign out", error);
    }
  }

  /**
   * Get the current authenticated user
   */
  getCurrentUser(): User | null {
    const user = this.auth.currentUser;
    return user ? this._mapFirebaseUser(user) : null;
  }

  /**
   * Listen to auth state changes
   */
  onAuthStateChanged(callback: (user: User | null) => void): () => void {
    return firebaseOnAuthStateChanged(this.auth, (firebaseUser) => {
      const mappedUser = firebaseUser
        ? this._mapFirebaseUser(firebaseUser)
        : null;

      // Update Sentry user context if integration is provided
      if (this.sentry) {
        this.sentry.setUser(mappedUser);
      }

      callback(mappedUser);
    });
  }

  /**
   * Map Firebase user to application user object
   * @private
   */
  private _mapFirebaseUser(firebaseUser: FirebaseUser): User {
    return {
      uid: firebaseUser.uid,
      ...(typeof firebaseUser.email === "string"
        ? { email: firebaseUser.email }
        : {}),
      ...(typeof firebaseUser.displayName === "string"
        ? { displayName: firebaseUser.displayName }
        : {}),
      ...(typeof firebaseUser.photoURL === "string"
        ? { photoURL: firebaseUser.photoURL }
        : {}),
      emailVerified: firebaseUser.emailVerified,
      isAnonymous: firebaseUser.isAnonymous,
    };
  }

  private _getActionCodeSettings(
    path: string,
    redirectPath?: string,
  ): { url: string; handleCodeInApp: true } | null {
    const origin =
      typeof window !== "undefined" && window.location?.origin
        ? window.location.origin
        : null;
    if (!origin) return null;

    const url = new URL(path, origin);
    if (
      redirectPath &&
      redirectPath.startsWith("/") &&
      !redirectPath.startsWith("//")
    ) {
      url.searchParams.set("redirect", redirectPath);
    }
    return { url: url.toString(), handleCodeInApp: true };
  }
}

/**
 * Custom error class for auth repository errors
 */
export class AuthRepositoryError extends Error {
  originalError: unknown;
  code?: string;

  constructor(message: string, originalError: unknown) {
    super(message);
    this.name = "AuthRepositoryError";
    this.originalError = originalError;
    const extractedCode =
      originalError &&
      typeof originalError === "object" &&
      "code" in originalError &&
      typeof originalError.code === "string"
        ? originalError.code
        : null;
    if (extractedCode) {
      this.code = extractedCode;
    }
  }
}

/**
 * Mock auth repository for testing
 */
export class MockAuthRepository {
  private currentUser: User | null = null;
  private authStateCallbacks: Array<(user: User | null) => void> = [];

  async signInWithGoogle(): Promise<User> {
    this.currentUser = {
      uid: "mock-user-id",
      email: "test@example.com",
      displayName: "Test User",
      photoURL: null,
      emailVerified: true,
      isAnonymous: false,
    };

    this._notifyAuthStateChange();
    return this.currentUser;
  }

  async signInWithEmail(email: string, _password: string): Promise<User> {
    this.currentUser = {
      uid: "mock-user-id",
      email,
      displayName: "Test User",
      emailVerified: true,
      isAnonymous: false,
    };

    this._notifyAuthStateChange();
    return this.currentUser;
  }

  async signUpWithEmail(
    email: string,
    _password: string,
    displayName?: string,
  ): Promise<User> {
    this.currentUser = {
      uid: "mock-user-id",
      email,
      displayName: displayName || "Test User",
      emailVerified: false,
      isAnonymous: false,
    };

    this._notifyAuthStateChange();
    return this.currentUser;
  }

  async sendPasswordReset(_email: string): Promise<void> {
    return;
  }

  async sendVerificationEmail(_redirectPath?: string): Promise<void> {
    return;
  }

  async verifyEmailWithCode(_oobCode: string): Promise<void> {
    if (this.currentUser) {
      this.currentUser.emailVerified = true;
      this._notifyAuthStateChange();
    }
    return;
  }

  async validatePasswordResetCode(_oobCode: string): Promise<string> {
    return this.currentUser && typeof this.currentUser.email === "string"
      ? this.currentUser.email
      : "test@example.com";
  }

  async confirmPasswordResetWithCode(
    _oobCode: string,
    _newPassword: string,
  ): Promise<void> {
    return;
  }

  async refreshCurrentUser(): Promise<User | null> {
    return this.currentUser;
  }

  async signOut(): Promise<void> {
    this.currentUser = null;
    await clearUserScopedLocalState();
    this._notifyAuthStateChange();
  }

  getCurrentUser(): User | null {
    return this.currentUser;
  }

  onAuthStateChanged(callback: (user: User | null) => void): () => void {
    this.authStateCallbacks.push(callback);

    // Immediately invoke with current state
    callback(this.currentUser);

    // Return unsubscribe function
    return () => {
      const index = this.authStateCallbacks.indexOf(callback);
      if (index > -1) {
        this.authStateCallbacks.splice(index, 1);
      }
    };
  }

  private _notifyAuthStateChange(): void {
    this.authStateCallbacks.forEach((callback) => callback(this.currentUser));
  }
}
