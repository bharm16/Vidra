import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  type MockedFunction,
} from "vitest";

import { detectSceneChange } from "@/utils/sceneChange/sceneChangeApi";
import type { SceneChangeRequest } from "@/utils/sceneChange/types";
import { buildFirebaseAuthHeaders } from "@/services/http/firebaseAuth";

vi.mock("@/services/http/firebaseAuth", () => ({
  buildFirebaseAuthHeaders: vi.fn(),
}));

const mockBuildFirebaseAuthHeaders = vi.mocked(buildFirebaseAuthHeaders);

describe("sceneChangeApi", () => {
  const originalFetch = global.fetch;

  const request: SceneChangeRequest = {
    changedField: "Location",
    oldValue: "Forest",
    newValue: "Desert",
    fullPrompt: "Prompt text",
    affectedFields: { Location: "Forest" },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockBuildFirebaseAuthHeaders.mockResolvedValue({ "X-Test-Auth": "token" });
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe("error handling", () => {
    it("throws when fetch is unavailable", async () => {
      const globalWithFetch = global as { fetch?: typeof fetch };
      globalWithFetch.fetch = undefined as unknown as typeof fetch;

      await expect(detectSceneChange(request)).rejects.toThrow(
        "Fetch is not available in this environment.",
      );
    });

    it("throws when the response is not ok", async () => {
      const fetchImpl: MockedFunction<typeof fetch> = vi
        .fn()
        .mockResolvedValue({
          ok: false,
          status: 500,
          statusText: "Server Error",
        } as Response);

      await expect(detectSceneChange(request, fetchImpl)).rejects.toThrow(
        "HTTP 500: Server Error",
      );
    });
  });

  describe("core behavior", () => {
    it("posts the request with auth headers and returns the response JSON", async () => {
      const payload = { isSceneChange: true, confidence: "high" };
      const fetchImpl: MockedFunction<typeof fetch> = vi
        .fn()
        .mockResolvedValue({
          ok: true,
          status: 200,
          statusText: "OK",
          json: async () => payload,
        } as Response);

      const result = await detectSceneChange(request, fetchImpl);

      expect(result).toEqual(payload);
      expect(fetchImpl).toHaveBeenCalledWith("/api/enhancement/scene-change", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Test-Auth": "token",
        },
        body: JSON.stringify(request),
      });
    });
  });
});
