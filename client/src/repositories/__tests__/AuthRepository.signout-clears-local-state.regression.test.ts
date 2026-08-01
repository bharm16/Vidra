import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Auth } from "firebase/auth";
import { AuthRepository } from "../AuthRepository";

/**
 * Regression: sign-out only ended the Firebase session — the local history
 * mirror (localStorage "promptHistory") and persisted logs survived, so the
 * next visitor on the browser (a guest, or a different user) opened /history
 * and saw the previous user's session titles and prompts.
 */

const firebaseSignOut = vi.hoisted(() => vi.fn());

vi.mock("firebase/auth", () => ({
  GoogleAuthProvider: class {},
  createUserWithEmailAndPassword: vi.fn(),
  signInWithPopup: vi.fn(),
  signInWithEmailAndPassword: vi.fn(),
  signOut: firebaseSignOut,
  sendPasswordResetEmail: vi.fn(),
  sendEmailVerification: vi.fn(),
  applyActionCode: vi.fn(),
  verifyPasswordResetCode: vi.fn(),
  confirmPasswordReset: vi.fn(),
  updateProfile: vi.fn(),
  onAuthStateChanged: vi.fn(),
}));

const seedUserScopedState = (): void => {
  localStorage.setItem(
    "promptHistory",
    JSON.stringify([
      {
        id: "session_123",
        uuid: "uuid-1",
        input: "a clockmaker winds a brass clock",
        output: "a clockmaker adjusts a brass clock",
      },
    ]),
  );
  localStorage.setItem(
    "prompt_builder_logs",
    JSON.stringify([{ level: "info", message: "user content in logs" }]),
  );
};

describe("regression: sign-out leaves no user-scoped local state behind", () => {
  beforeEach(() => {
    localStorage.clear();
    firebaseSignOut.mockReset();
  });

  it("a successful sign-out clears the history mirror and persisted logs", async () => {
    seedUserScopedState();
    firebaseSignOut.mockResolvedValueOnce(undefined);

    const repo = new AuthRepository({} as Auth);
    await repo.signOut();

    expect(localStorage.getItem("promptHistory")).toBeNull();
    expect(localStorage.getItem("prompt_builder_logs")).toBeNull();
  });

  it("a failed sign-out clears nothing — the user is still signed in", async () => {
    seedUserScopedState();
    firebaseSignOut.mockRejectedValueOnce(new Error("network down"));

    const repo = new AuthRepository({} as Auth);
    await expect(repo.signOut()).rejects.toThrow();

    expect(localStorage.getItem("promptHistory")).not.toBeNull();
    expect(localStorage.getItem("prompt_builder_logs")).not.toBeNull();
  });
});
