import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `getAuth` throws `auth/invalid-api-key` when VITE_FIREBASE_API_KEY is absent.
 * While auth/db were module-level constants, that throw happened at *import*
 * time, so every module transitively importing this one failed to load without
 * credentials — 88 test files went red in CI, none of which touch Firebase.
 *
 * The invariant is structural, not "it doesn't throw": asserting the latter
 * would pass locally purely because .env exists, and stay silent about the
 * thing that actually broke. What must hold is that importing constructs
 * nothing — only asking for a service may construct one.
 */

const initializeAppSpy = vi.fn((..._args: unknown[]) => ({ name: "test-app" }));
const getAuthSpy = vi.fn((..._args: unknown[]) => ({ currentUser: null }));
const initializeFirestoreSpy = vi.fn((..._args: unknown[]) => ({
  type: "firestore",
}));

vi.mock("firebase/app", () => ({ initializeApp: initializeAppSpy }));
vi.mock("firebase/auth", () => ({ getAuth: getAuthSpy }));
vi.mock("firebase/firestore", () => ({
  initializeFirestore: initializeFirestoreSpy,
  memoryLocalCache: () => ({ kind: "memory" }),
}));
vi.mock("firebase/analytics", () => ({
  getAnalytics: vi.fn(() => ({ kind: "analytics" })),
}));

// The shared client setup stubs @/config/firebase for every jsdom test. This
// is the one file that must exercise the real module — otherwise it would
// assert against the stub and pass no matter what the real module does.
vi.unmock("@/config/firebase");

describe("firebase config import safety (regression)", () => {
  beforeEach(() => {
    vi.resetModules();
    initializeAppSpy.mockClear();
    getAuthSpy.mockClear();
    initializeFirestoreSpy.mockClear();
  });

  it("constructs nothing at import time", async () => {
    await import("@/config/firebase");

    expect(initializeAppSpy).not.toHaveBeenCalled();
    expect(getAuthSpy).not.toHaveBeenCalled();
    expect(initializeFirestoreSpy).not.toHaveBeenCalled();
  });

  it("constructs auth only when asked, and memoizes it", async () => {
    const { getFirebaseAuth } = await import("@/config/firebase");

    expect(getAuthSpy).not.toHaveBeenCalled();
    expect(getFirebaseAuth()).toBe(getFirebaseAuth());
    expect(getAuthSpy).toHaveBeenCalledTimes(1);
  });

  it("constructs firestore only when asked, and memoizes it", async () => {
    const { getFirebaseDb } = await import("@/config/firebase");

    expect(initializeFirestoreSpy).not.toHaveBeenCalled();
    expect(getFirebaseDb()).toBe(getFirebaseDb());
    expect(initializeFirestoreSpy).toHaveBeenCalledTimes(1);
  });

  it("shares one app across auth and firestore", async () => {
    const { getFirebaseAuth, getFirebaseDb } = await import(
      "@/config/firebase"
    );

    getFirebaseAuth();
    getFirebaseDb();

    expect(initializeAppSpy).toHaveBeenCalledTimes(1);
  });
});
