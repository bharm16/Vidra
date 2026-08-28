import { describe, expect, it, vi } from "vitest";

import { applySuggestionToPrompt } from "@features/prompt-optimizer/utils/applySuggestion";
// relocateQuote is a pure, deterministic util with its own suite — the tests
// below drive it with real inputs instead of mocking an internal seam.

vi.mock("@/services/LoggingService", () => ({
  logger: {
    child: () => ({ warn: vi.fn() }),
  },
}));


describe("applySuggestionToPrompt", () => {
  it("returns null when prompt or suggestion is empty", () => {
    expect(
      applySuggestionToPrompt({
        prompt: "Hello",
        suggestionText: "",
      }),
    ).toEqual({ updatedPrompt: null });
  });

  it("applies suggestion using relocated match", () => {
    const result = applySuggestionToPrompt({
      prompt: "Hello world",
      suggestionText: "there",
      highlight: "world",
      spanMeta: { idempotencyKey: "key-1" },
    });

    expect(result).toEqual({
      updatedPrompt: "Hello there",
      replacementTarget: "world",
      idempotencyKey: "key-1",
      matchStart: 6,
      matchEnd: 11,
    });
  });

  it("returns null when relocation fails", () => {
    const result = applySuggestionToPrompt({
      prompt: "Hello world",
      suggestionText: "there",
      highlight: "zebra",
    });

    expect(result).toEqual({ updatedPrompt: null });
  });

  it("returns null when suggestion does not change prompt", () => {
    const result = applySuggestionToPrompt({
      prompt: "Hello",
      suggestionText: "Hello",
    });

    expect(result).toEqual({ updatedPrompt: null });
  });
});
