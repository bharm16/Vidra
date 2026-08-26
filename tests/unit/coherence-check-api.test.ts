import { describe, it, expect, beforeEach, vi } from "vitest";

import { checkPromptCoherence } from "@features/prompt-optimizer/api/coherenceCheckApi";
import { apiClient } from "@/services/ApiClient";

// checkPromptCoherence is now a thin wrapper over apiRequest, which routes
// through apiClient.rawRequest (auth headers, telemetry-source, 401-retry).
// Mock the transport seam so the real apiRequest + CoherenceCheckResultSchema
// run end-to-end; header/envelope mechanics are covered by apiRequest's own test.
vi.mock("@/services/ApiClient", () => ({
  apiClient: { rawRequest: vi.fn() },
}));

const rawRequest = vi.mocked(apiClient.rawRequest);

const jsonResponse = (body: unknown, ok = true, status = 200): Response =>
  ({ ok, status, json: async () => body }) as unknown as Response;

describe("checkPromptCoherence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("posts the payload to the coherence endpoint and returns the unwrapped result", async () => {
    rawRequest.mockResolvedValue(
      jsonResponse({
        success: true,
        data: { conflicts: [], harmonizations: [] },
      }),
    );

    const result = await checkPromptCoherence({
      beforePrompt: "test",
      afterPrompt: "test",
    });

    expect(rawRequest).toHaveBeenCalledWith(
      "/enhancement/prompt-coherence",
      expect.objectContaining({
        method: "POST",
        body: { beforePrompt: "test", afterPrompt: "test" },
      }),
    );
    expect(result).toEqual({ conflicts: [], harmonizations: [] });
  });

  it("throws the server error message on a non-OK response", async () => {
    rawRequest.mockResolvedValue(
      jsonResponse(
        { success: false, error: "coherence unavailable" },
        false,
        500,
      ),
    );

    await expect(
      checkPromptCoherence({ beforePrompt: "test", afterPrompt: "test" }),
    ).rejects.toThrow("coherence unavailable");
  });

  it("rejects a malformed (non-envelope) payload at the schema boundary", async () => {
    rawRequest.mockResolvedValue(
      jsonResponse({
        conflicts: [
          { message: "Missing recommendations", reasoning: "bad payload" },
        ],
        harmonizations: [],
      }),
    );

    await expect(
      checkPromptCoherence({ beforePrompt: "test", afterPrompt: "test" }),
    ).rejects.toThrow();
  });
});
