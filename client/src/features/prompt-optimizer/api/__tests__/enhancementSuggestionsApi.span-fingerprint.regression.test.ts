/**
 * Regression: the feature adapter must forward the parsed wire response, not
 * rebuild it field-by-field.
 *
 * The adapter used to reconstruct the response from four known fields, which
 * silently dropped `spanFingerprint` — the server's authoritative span
 * fingerprint. useSuggestionFetch branches on it to warm the cache under the
 * server's key, so that branch could never run.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { postEnhancementSuggestions } from "@/api/enhancementSuggestionsApi";
import { fetchEnhancementSuggestions } from "../enhancementSuggestionsApi";

vi.mock("@/api/enhancementSuggestionsApi", () => ({
  postEnhancementSuggestions: vi.fn(),
}));

const params = {
  highlightedText: "wide shot",
  contextBefore: "a ",
  contextAfter: " of a lighthouse",
  fullPrompt: "a wide shot of a lighthouse",
  inputPrompt: "lighthouse at dusk",
};

describe("fetchEnhancementSuggestions wire forwarding (regression)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("forwards the server's spanFingerprint to the caller", async () => {
    vi.mocked(postEnhancementSuggestions).mockResolvedValue({
      suggestions: ["close-up"],
      isPlaceholder: false,
      spanFingerprint: "server-fingerprint-abc",
    });

    const result = await fetchEnhancementSuggestions(params);

    expect(result.spanFingerprint).toBe("server-fingerprint-abc");
  });

  it("forwards metadata and debug payloads unchanged", async () => {
    vi.mocked(postEnhancementSuggestions).mockResolvedValue({
      suggestions: ["close-up"],
      isPlaceholder: true,
      metadata: { category: "camera" },
      _debug: { provider: "groq" },
    });

    const result = await fetchEnhancementSuggestions(params);

    expect(result).toEqual({
      suggestions: ["close-up"],
      isPlaceholder: true,
      metadata: { category: "camera" },
      _debug: { provider: "groq" },
    });
  });

  it("omits spanFingerprint when the server did not send one", async () => {
    vi.mocked(postEnhancementSuggestions).mockResolvedValue({
      suggestions: [],
      isPlaceholder: false,
    });

    const result = await fetchEnhancementSuggestions(params);

    expect(result.spanFingerprint).toBeUndefined();
    expect(result.suggestions).toEqual([]);
  });
});
