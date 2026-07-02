import { describe, it, expect, beforeEach, vi } from "vitest";

import { checkPromptCoherence } from "@features/prompt-optimizer/api/coherenceCheckApi";
import { buildFirebaseAuthHeaders } from "@/services/http/firebaseAuth";

vi.mock("@/services/http/firebaseAuth", () => ({
  buildFirebaseAuthHeaders: vi.fn(),
}));

const mockBuildFirebaseAuthHeaders = vi.mocked(buildFirebaseAuthHeaders);

describe("checkPromptCoherence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("error handling", () => {
    it("throws when fetch is unavailable", async () => {
      const originalFetch = globalThis.fetch;
      delete (globalThis as { fetch?: typeof fetch }).fetch;

      await expect(
        checkPromptCoherence({ beforePrompt: "test", afterPrompt: "test" }),
      ).rejects.toThrow("Fetch is not available in this environment.");

      globalThis.fetch = originalFetch;
    });

    it("throws when the response is not ok", async () => {
      mockBuildFirebaseAuthHeaders.mockResolvedValue({
        Authorization: "Bearer token",
      });
      const fetchImpl = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
      });

      await expect(
        checkPromptCoherence(
          { beforePrompt: "test", afterPrompt: "test" },
          { fetchImpl },
        ),
      ).rejects.toThrow("Failed to check coherence: 500");
    });
  });

  describe("core behavior", () => {
    it("returns parsed JSON for successful responses", async () => {
      mockBuildFirebaseAuthHeaders.mockResolvedValue({
        Authorization: "Bearer token",
      });
      const fetchImpl = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            success: true,
            data: {
              conflicts: [],
              harmonizations: [],
            },
          }),
      });

      const result = await checkPromptCoherence(
        { beforePrompt: "test", afterPrompt: "test" },
        { fetchImpl },
      );

      expect(fetchImpl).toHaveBeenCalledWith(
        "/api/enhancement/prompt-coherence",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            "Content-Type": "application/json",
            Authorization: "Bearer token",
          }),
        }),
      );
      expect(result).toEqual({ conflicts: [], harmonizations: [] });
    });

    it("rejects malformed coherence payloads at the boundary", async () => {
      mockBuildFirebaseAuthHeaders.mockResolvedValue({
        Authorization: "Bearer token",
      });
      const fetchImpl = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            conflicts: [
              { message: "Missing recommendations", reasoning: "bad payload" },
            ],
            harmonizations: [],
          }),
      });

      await expect(
        checkPromptCoherence(
          { beforePrompt: "test", afterPrompt: "test" },
          { fetchImpl },
        ),
      ).rejects.toThrow();
    });
  });
});
