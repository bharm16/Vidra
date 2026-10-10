/**
 * Unit tests for AuthRepository
 *
 * Tests MockAuthRepository (testable without Firebase) and AuthRepositoryError.
 */

import { describe, expect, it, vi } from "vitest";
import { AuthRepositoryError, MockAuthRepository } from "../AuthRepository";

// ---------------------------------------------------------------------------
// AuthRepositoryError
// ---------------------------------------------------------------------------
describe("AuthRepositoryError", () => {
  it("extracts code from original error when present", () => {
    const original = { code: "auth/user-not-found", message: "not found" };
    const error = new AuthRepositoryError("wrapper", original);
    expect(error.code).toBe("auth/user-not-found");
  });

  it("does not set code when original error code is not a string", () => {
    const error = new AuthRepositoryError("wrapper", {
      code: 123,
      message: "x",
    });
    expect(error.code).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// MockAuthRepository
// ---------------------------------------------------------------------------
describe("MockAuthRepository", () => {
  describe("onAuthStateChanged", () => {
    it("notifies on sign out", async () => {
      const repo = new MockAuthRepository();
      const callback = vi.fn();
      await repo.signInWithGoogle();
      repo.onAuthStateChanged(callback);
      await repo.signOut();
      expect(repo.getCurrentUser()).toBeNull();
      expect(callback).toHaveBeenCalledTimes(2);
      const secondCall = callback.mock.calls[1];
      expect(secondCall).toBeDefined();
      expect(secondCall?.[0]).toBeNull();
    });

    it("returns unsubscribe function that stops notifications", async () => {
      const repo = new MockAuthRepository();
      const callback = vi.fn();
      const unsubscribe = repo.onAuthStateChanged(callback);
      unsubscribe();
      await repo.signInWithGoogle();
      // Only the initial call should have happened
      expect(callback).toHaveBeenCalledTimes(1);
    });
  });

  describe("verifyEmailWithCode", () => {
    it("sets emailVerified to true on current user", async () => {
      const repo = new MockAuthRepository();
      await repo.signUpWithEmail("test@test.com", "pass");
      expect(repo.getCurrentUser()?.emailVerified).toBe(false);
      await repo.verifyEmailWithCode("oob-code");
      expect(repo.getCurrentUser()?.emailVerified).toBe(true);
    });
  });
});
