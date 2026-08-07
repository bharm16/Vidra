import React from "react";
import { expect, afterEach, vi } from "vitest";
// Ensure all tests run with test environment semantics
process.env.NODE_ENV = "test";
process.env.GCS_BUCKET_NAME =
  process.env.GCS_BUCKET_NAME || "prompt-builder-test-bucket";
process.env.VIDEO_GENERATE_IDEMPOTENCY_MODE =
  process.env.VIDEO_GENERATE_IDEMPOTENCY_MODE || "soft";
import { cleanup } from "@testing-library/react";
import * as matchers from "@testing-library/jest-dom/matchers";

// Extend Vitest's expect with jest-dom matchers
expect.extend(matchers);

// Cleanup after each test
afterEach(() => {
  // Prevent fake timers from leaking between tests (breaks userEvent.type and other async flows).
  vi.useRealTimers();
  cleanup();
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

// Mock localStorage with actual storage
const localStorageMock = (() => {
  let store = {};
  return {
    getItem: vi.fn((key) => store[key] ?? null),
    setItem: vi.fn((key, value) => {
      store[key] = String(value);
    }),
    removeItem: vi.fn((key) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    }),
    get length() {
      return Object.keys(store).length;
    },
    key: vi.fn((index) => {
      const keys = Object.keys(store);
      return keys[index] || null;
    }),
  };
})();
global.localStorage = localStorageMock;

// Mock fetch
// Provide a safe default fetch mock so tests that indirectly touch adapters
// (e.g. GeminiAdapter) don't crash with "Cannot read properties of undefined (reading 'ok')".
// Individual tests can still override `global.fetch` as needed.
global.fetch = vi.fn().mockResolvedValue({
  ok: true,
  status: 200,
  statusText: "OK",
  json: async () => ({
    candidates: [{ content: { parts: [{ text: "stub" }] } }],
  }),
  text: async () =>
    JSON.stringify({
      candidates: [{ content: { parts: [{ text: "stub" }] } }],
    }),
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
    getFirebaseAnalytics: () => null,
  };
});

// Mock Toast context for components
vi.mock("./src/components/Toast.jsx", () => ({
  useToast: vi.fn(() => ({
    // Generic API
    showToast: vi.fn(),
    hideToast: vi.fn(),
    toast: null,
    // Convenience helpers used in hooks/components
    success: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
  })),
  ToastProvider: ({ children }) => children,
  default: () => null,
}));

// Mock PromptStudio UI primitives used in components
vi.mock("@promptstudio/system/components/ui/button", () => ({
  Button: React.forwardRef(({ children, ...props }, ref) =>
    React.createElement("button", { ...props, ref }, children),
  ),
}));

vi.mock("@promptstudio/system/components/ui/input", () => ({
  Input: (props) => React.createElement("input", props),
}));

vi.mock("@promptstudio/system/components/ui/textarea", () => ({
  Textarea: (props) => React.createElement("textarea", props),
}));
