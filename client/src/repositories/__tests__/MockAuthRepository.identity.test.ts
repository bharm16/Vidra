import { afterEach, describe, expect, it, vi } from "vitest";
import { MockAuthRepository } from "../AuthRepository";

const TEST_OWNER = "api-key:replay-cross-mode-key";
const SIGN_IN_METHODS = ["google", "email", "signup"] as const;

describe("mock authentication owner identity", () => {
  it.each(SIGN_IN_METHODS)("keeps the default owner for %s", async (method) => {
    const repository = new MockAuthRepository();
    const user =
      method === "google"
        ? await repository.signInWithGoogle()
        : method === "email"
          ? await repository.signInWithEmail("test@example.com", "password")
          : await repository.signUpWithEmail("test@example.com", "password");
    expect(user.uid).toBe("mock-user-id");
    expect(repository.getCurrentUser()?.uid).toBe("mock-user-id");
  });

  it.each(SIGN_IN_METHODS)(
    "uses the configured owner for %s and auth observers",
    async (method) => {
      const repository = new MockAuthRepository(TEST_OWNER);
      const observer = vi.fn();
      const unsubscribe = repository.onAuthStateChanged(observer);
      expect(observer).toHaveBeenLastCalledWith(null);
      const user =
        method === "google"
          ? await repository.signInWithGoogle()
          : method === "email"
            ? await repository.signInWithEmail("test@example.com", "password")
            : await repository.signUpWithEmail("test@example.com", "password");
      expect(user.uid).toBe(TEST_OWNER);
      expect(repository.getCurrentUser()?.uid).toBe(TEST_OWNER);
      expect(observer).toHaveBeenLastCalledWith(
        expect.objectContaining({ uid: TEST_OWNER }),
      );
      const lateObserver = vi.fn();
      const unsubscribeLate = repository.onAuthStateChanged(lateObserver);
      expect(lateObserver).toHaveBeenCalledWith(
        expect.objectContaining({ uid: TEST_OWNER }),
      );
      unsubscribe();
      unsubscribeLate();
    },
  );
});

describe("injected E2E authentication identity", () => {
  afterEach(() => {
    delete (window as unknown as Record<string, unknown>).__E2E_AUTH_USER__;
    vi.resetModules();
  });

  it("uses the injected owner when the repository provider signs in", async () => {
    vi.resetModules();
    (window as unknown as Record<string, unknown>).__E2E_AUTH_USER__ = {
      uid: TEST_OWNER,
      email: "e2e@example.com",
    };
    const { getAuthRepository } = await import("../index");
    const repository = getAuthRepository();
    expect(repository.getCurrentUser()?.uid).toBe(TEST_OWNER);
    const observer = vi.fn();
    const unsubscribe = repository.onAuthStateChanged(observer);
    expect(observer).toHaveBeenCalledWith(
      expect.objectContaining({ uid: TEST_OWNER }),
    );
    unsubscribe();
  });

  it.each(["", 42, undefined])(
    "rejects an invalid injected uid (%s)",
    async (uid) => {
      vi.resetModules();
      (window as unknown as Record<string, unknown>).__E2E_AUTH_USER__ = {
        uid,
        email: "e2e@example.com",
      };
      const { getAuthRepository } = await import("../index");
      expect(() => getAuthRepository()).toThrow();
    },
  );
});
