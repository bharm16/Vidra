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

const originalMode = (import.meta as { env?: { MODE?: string } }).env?.MODE;

async function loadFirebaseAuthModule() {
  vi.resetModules();
  return import("../firebaseAuth");
}

const setMode = (mode?: string): void => {
  const env = { ...((import.meta as { env?: { MODE?: string } }).env ?? {}) };
  if (typeof mode === "string") {
    env.MODE = mode;
  } else {
    delete env.MODE;
  }
  (import.meta as { env?: { MODE?: string } }).env = env;
};

describe("firebaseAuth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
    mockAuth.currentUser = null;
    mockOnAuthStateChanged.mockImplementation((_auth, onNext) => {
      onNext(mockAuth.currentUser);
      return vi.fn();
    });
    setMode("test");
  });

  afterEach(() => {
    vi.useRealTimers();
    setMode(originalMode);
  });

  it("returns null token after auth-ready timeout when auth state never resolves", async () => {
    vi.useFakeTimers();
    mockOnAuthStateChanged.mockImplementation(() => vi.fn());
    const { getFirebaseToken } = await loadFirebaseAuthModule();

    const tokenPromise = getFirebaseToken();
    expect(mockOnAuthStateChanged).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(3000);
    await expect(tokenPromise).resolves.toBeNull();
  });

  it("returns dev fallback API key when no user exists outside production", async () => {
    const { buildFirebaseAuthHeaders } = await loadFirebaseAuthModule();

    await expect(buildFirebaseAuthHeaders()).resolves.toEqual({
      "X-API-Key": "dev-key-12345",
    });
  });

  it("returns mode-dependent headers when no user exists", async () => {
    const { buildFirebaseAuthHeaders } = await loadFirebaseAuthModule();
    const mode = (import.meta as { env?: { MODE?: string } }).env?.MODE;

    if (mode === "production") {
      await expect(buildFirebaseAuthHeaders()).resolves.toEqual({});
    } else {
      await expect(buildFirebaseAuthHeaders()).resolves.toEqual({
        "X-API-Key": "dev-key-12345",
      });
    }
  });

  it("returns firebase token header when user token resolves", async () => {
    mockAuth.currentUser = {
      getIdToken: vi.fn().mockResolvedValue("firebase-token-123"),
    };

    const { buildFirebaseAuthHeaders, getFirebaseToken } =
      await loadFirebaseAuthModule();

    await expect(getFirebaseToken()).resolves.toBe("firebase-token-123");
    const mode = (import.meta as { env?: { MODE?: string } }).env?.MODE;
    if (mode === "production") {
      await expect(buildFirebaseAuthHeaders()).resolves.toEqual({
        "X-Firebase-Token": "firebase-token-123",
      });
    } else {
      await expect(buildFirebaseAuthHeaders()).resolves.toEqual({
        "X-Firebase-Token": "firebase-token-123",
        "X-API-Key": "dev-key-12345",
      });
    }
  });

  it("returns empty auth headers when token retrieval fails", async () => {
    mockAuth.currentUser = {
      getIdToken: vi
        .fn()
        .mockRejectedValue(new Error("token provider unavailable")),
    };

    const { buildFirebaseAuthHeaders, getFirebaseToken } =
      await loadFirebaseAuthModule();

    await expect(getFirebaseToken()).resolves.toBeNull();
    const mode = (import.meta as { env?: { MODE?: string } }).env?.MODE;
    if (mode === "production") {
      await expect(buildFirebaseAuthHeaders()).resolves.toEqual({});
    } else {
      await expect(buildFirebaseAuthHeaders()).resolves.toEqual({
        "X-API-Key": "dev-key-12345",
      });
    }
  });

  it("waits for auth state only once across repeated calls", async () => {
    const { buildFirebaseAuthHeaders } = await loadFirebaseAuthModule();

    await buildFirebaseAuthHeaders();
    await buildFirebaseAuthHeaders();

    expect(mockOnAuthStateChanged).toHaveBeenCalledTimes(1);
  });
});
