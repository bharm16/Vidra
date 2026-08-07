import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockAuth, mockOnAuthStateChanged } = vi.hoisted(() => ({
  mockAuth: {
    currentUser: null as null | {
      getIdToken: () => Promise<string>;
    },
  },
  mockOnAuthStateChanged: vi.fn(),
}));

vi.mock("@/config/firebase", () => ({
  getFirebaseAuth: () => mockAuth,
}));

vi.mock("firebase/auth", () => ({
  onAuthStateChanged: mockOnAuthStateChanged,
}));

async function loadFirebaseAuthModule() {
  vi.resetModules();
  return import("../firebaseAuth");
}

const originalMode = (import.meta as { env?: { MODE?: string } }).env?.MODE;

const setMode = (mode?: string): void => {
  const env = { ...((import.meta as { env?: { MODE?: string } }).env ?? {}) };
  if (typeof mode === "string") {
    env.MODE = mode;
  } else {
    delete env.MODE;
  }
  (import.meta as { env?: { MODE?: string } }).env = env;
};

describe("firebaseAuth regression", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockOnAuthStateChanged.mockImplementation((_auth, onNext) => {
      onNext(mockAuth.currentUser);
      return vi.fn();
    });
    setMode("development");
    mockAuth.currentUser = {
      getIdToken: vi.fn().mockResolvedValue("firebase-token-123"),
    };
  });

  afterEach(() => {
    setMode(originalMode);
  });

  it("includes dev API key fallback when Firebase token is present in development", async () => {
    const { buildFirebaseAuthHeaders } = await loadFirebaseAuthModule();

    await expect(buildFirebaseAuthHeaders()).resolves.toEqual({
      "X-Firebase-Token": "firebase-token-123",
      "X-API-Key": "dev-key-12345",
    });
  });
});
