import { describe, it, expect, vi, beforeEach } from "vitest";

import {
  requestEnhancementSuggestions,
  parseEnhancementSuggestionsResponse,
  postEnhancementSuggestions,
  type EnhancementSuggestionsRequest,
} from "@/api/enhancementSuggestionsApi";
import { buildFirebaseAuthHeaders } from "@/services/http/firebaseAuth";

vi.mock("@/services/http/firebaseAuth", () => ({
  buildFirebaseAuthHeaders: vi.fn(),
}));

describe("client enhancementSuggestionsApi", () => {
  const mockBuildHeaders = vi.mocked(buildFirebaseAuthHeaders);

  const payload: EnhancementSuggestionsRequest = {
    highlightedText: "highlight",
    fullPrompt: "full prompt text",
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("error handling", () => {
    it("throws when response is not ok", async () => {
      mockBuildHeaders.mockResolvedValue({ Authorization: "Bearer token" });
      const fetchImpl = vi
        .fn()
        .mockResolvedValue(new Response("error", { status: 500 }));

      await expect(
        postEnhancementSuggestions(payload, { fetchImpl }),
      ).rejects.toThrow("Failed to fetch suggestions: 500");
    });
  });

  describe("edge cases", () => {
    it("defaults to empty suggestions when response is malformed", async () => {
      const response = new Response(JSON.stringify({ suggestions: "bad" }));

      const parsed =
        await parseEnhancementSuggestionsResponse<string>(response);

      expect(parsed).toEqual({ suggestions: [], isPlaceholder: false });
    });

    it("unwraps suggestions from the canonical success envelope", async () => {
      const response = new Response(
        JSON.stringify({
          success: true,
          data: {
            suggestions: ["Use a low-angle shot", "Add rim lighting"],
            isPlaceholder: false,
            spanFingerprint: "fp-1",
          },
        }),
      );

      const parsed =
        await parseEnhancementSuggestionsResponse<string>(response);

      expect(parsed.suggestions).toEqual([
        "Use a low-angle shot",
        "Add rim lighting",
      ]);
      expect(parsed.spanFingerprint).toBe("fp-1");
    });
  });

  describe("core behavior", () => {
    it("passes auth headers and payload to the request", async () => {
      const response = new Response(JSON.stringify({ ok: true }), {
        status: 200,
      });
      const fetchImpl = vi.fn().mockResolvedValue(response);
      mockBuildHeaders.mockResolvedValue({ Authorization: "Bearer token" });

      const result = await requestEnhancementSuggestions(payload, {
        fetchImpl,
      });

      expect(result).toBe(response);
      expect(fetchImpl).toHaveBeenCalledWith(
        "/api/enhancement/suggestions",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            "Content-Type": "application/json",
            Authorization: "Bearer token",
          }),
          body: JSON.stringify(payload),
        }),
      );
    });
  });
});
