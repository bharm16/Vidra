import { describe, expect, it, vi } from "vitest";

const { mockBuildFirebaseAuthHeaders } = vi.hoisted(() => ({
  mockBuildFirebaseAuthHeaders: vi.fn(),
}));

vi.mock("../firebaseAuth", () => ({
  buildFirebaseAuthHeaders: mockBuildFirebaseAuthHeaders,
}));

import { createFirebaseTokenInterceptor } from "../AuthInterceptors";

describe("AuthInterceptors", () => {
  it("injects firebase auth headers into outgoing request", async () => {
    mockBuildFirebaseAuthHeaders.mockResolvedValue({
      "X-Firebase-Token": "firebase-token",
    });

    const interceptor = createFirebaseTokenInterceptor();
    const result = await interceptor({
      url: "/api/test",
      init: {
        headers: {
          Authorization: "Bearer existing",
        },
      },
    });

    const headers = new Headers(result.init.headers);
    expect(headers.get("Authorization")).toBe("Bearer existing");
    expect(headers.get("X-Firebase-Token")).toBe("firebase-token");
  });

  it("overwrites existing auth header values when same header keys are returned", async () => {
    mockBuildFirebaseAuthHeaders.mockResolvedValue({
      Authorization: "Bearer refreshed",
    });

    const interceptor = createFirebaseTokenInterceptor();
    const result = await interceptor({
      url: "/api/test",
      init: {
        headers: {
          Authorization: "Bearer stale",
          "Content-Type": "application/json",
        },
      },
    });

    const headers = new Headers(result.init.headers);
    expect(headers.get("Authorization")).toBe("Bearer refreshed");
    expect(headers.get("Content-Type")).toBe("application/json");
  });
});
