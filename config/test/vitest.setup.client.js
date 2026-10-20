import { expect, afterEach, vi } from "vitest";
import * as matchers from "@testing-library/jest-dom/matchers";
import { applySharedTestSetup } from "./testSetupShared.js";

applySharedTestSetup();

// Extend Vitest's expect with jest-dom matchers
expect.extend(matchers);

// Prevent fake timers from leaking between tests (breaks userEvent.type and other async flows).
afterEach(() => {
  vi.useRealTimers();
});

// Mock window.matchMedia
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Mock Firebase.
//
// Previously this mocked "./src/firebase.js" — a path with no file behind it
// since the module became client/src/config/firebase.ts, so it stubbed nothing
// and no one noticed. Tests that render auth-aware UI reach the real
// accessors, and `getAuth` throws `auth/invalid-api-key` without the
// VITE_FIREBASE_* vars, which CI does not set.
//
// The factory runs once per module registry, so the stub instances are stable
// across calls — consumers that compare identity (or subscribe once) behave as
// they would against the memoized real accessors.
vi.mock("@/config/firebase", () => {
  // firebase/auth's modular helpers delegate to methods on the instance —
  // `onAuthStateChanged(auth, cb)` calls `auth.onAuthStateChanged(cb)` — so the
  // stub has to carry them, not just the data fields. Each returns an
  // unsubscribe, which is what callers store and invoke on cleanup.
  const noopUnsubscribe = () => {};
  const auth = {
    currentUser: null,
    onAuthStateChanged: vi.fn(() => noopUnsubscribe),
    onIdTokenChanged: vi.fn(() => noopUnsubscribe),
    signInWithEmailAndPassword: vi.fn(),
    signOut: vi.fn(),
  };
  const db = {
    collection: vi.fn(() => ({
      doc: vi.fn(() => ({
        set: vi.fn(),
        get: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      })),
      add: vi.fn(),
      where: vi.fn(),
    })),
  };
  return {
    getFirebaseAuth: () => auth,
    getFirebaseDb: () => db,
  };
});
