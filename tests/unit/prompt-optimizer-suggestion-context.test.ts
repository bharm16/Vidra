import { describe, expect, it, vi } from "vitest";

import {
  buildSuggestionContext,
  resolveHighlightLocation,
} from "@features/prompt-optimizer/utils/enhancementSuggestionContext";
import { relocateQuote } from "@utils/textQuoteRelocator";

vi.mock("@utils/textQuoteRelocator", () => ({
  relocateQuote: vi.fn(),
}));

const mockRelocateQuote = vi.mocked(relocateQuote);

describe("enhancementSuggestionContext", () => {
  it("falls back to indexOf when relocateQuote fails", () => {
    mockRelocateQuote.mockReturnValue(null);

    const result = resolveHighlightLocation({
      normalizedPrompt: "Hello world",
      highlightedText: "world",
      preferIndex: null,
    });

    expect(result).toEqual({
      startIndex: 6,
      matchLength: 5,
      found: true,
      usedFallback: true,
    });
  });

  it("returns not found when text does not exist", () => {
    mockRelocateQuote.mockReturnValue(null);

    const result = resolveHighlightLocation({
      normalizedPrompt: "Hello world",
      highlightedText: "missing",
      preferIndex: null,
    });

    expect(result).toEqual({
      startIndex: 0,
      matchLength: 7,
      found: false,
      usedFallback: true,
    });
  });

  it("builds suggestion context around the highlight", () => {
    mockRelocateQuote.mockReturnValue({ start: 6, end: 11, exact: true });

    const result = buildSuggestionContext("Hello world", "world", 6, 3);

    expect(result.contextBefore).toBe("lo");
    expect(result.contextAfter).toBe("");
    expect(result.found).toBe(true);
  });
});
