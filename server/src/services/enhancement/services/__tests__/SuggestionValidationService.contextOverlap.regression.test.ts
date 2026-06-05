import { describe, expect, it, vi } from "vitest";
import { SuggestionValidationService } from "../SuggestionValidationService";
import type { VideoService } from "../types";

function createService(): SuggestionValidationService {
  const videoPromptService: VideoService = {
    isVideoPrompt: vi.fn(() => true),
    countWords: vi.fn(
      (text: string) => text.split(/\s+/).filter(Boolean).length,
    ),
    detectVideoPhraseRole: vi.fn(() => null),
    getVideoReplacementConstraints: vi.fn(() => ({
      minWords: 1,
      maxWords: 50,
      maxSentences: 1,
    })),
    detectTargetModel: vi.fn(() => null),
    detectPromptSection: vi.fn(() => null),
    getCategoryFocusGuidance: vi.fn(() => null),
  };

  return new SuggestionValidationService(videoPromptService);
}

describe("SuggestionValidationService context overlap stripping regression", () => {
  it("strips trailing object overlap from action suggestion when it matches contextAfter", () => {
    const service = createService();

    // "tightly clutch the steering wheel" where "the steering wheel" already follows
    const result = service._stripContinuationOverlap(
      "tightly clutch the steering wheel",
      {
        highlightedCategory: "action.physical",
        contextAfter: "the steering wheel with white knuckles",
      },
    );

    expect(result).toBe("tightly clutch");
  });

  it("does not strip when category is not action", () => {
    const service = createService();

    const result = service._stripContinuationOverlap("warm golden rim light", {
      highlightedCategory: "lighting.quality",
      contextAfter: "rim light on the left",
    });

    expect(result).toBe("warm golden rim light");
  });

  it("does not strip when overlap is only 1 token", () => {
    const service = createService();

    const result = service._stripContinuationOverlap("firmly grip the", {
      highlightedCategory: "action.physical",
      contextAfter: "the steering wheel",
    });

    // Single-token overlap ("the") is too small to strip — could be coincidental
    expect(result).toBe("firmly grip the");
  });

  it("strips longer overlaps (4+ tokens)", () => {
    const service = createService();

    const result = service._stripContinuationOverlap(
      "aggressively slam down on the old wooden table",
      {
        highlightedCategory: "action.gesture",
        contextAfter: "on the old wooden table near the window",
      },
    );

    expect(result).toBe("aggressively slam down");
  });

  it("does not strip when there is no contextAfter", () => {
    const service = createService();

    const result = service._stripContinuationOverlap(
      "firmly grip the steering wheel",
      {
        highlightedCategory: "action.physical",
      },
    );

    expect(result).toBe("firmly grip the steering wheel");
  });

  it("does not strip when suggestion tail does not match continuation head", () => {
    const service = createService();

    const result = service._stripContinuationOverlap("carefully turn the key", {
      highlightedCategory: "action.physical",
      contextAfter: "the steering wheel with white knuckles",
    });

    expect(result).toBe("carefully turn the key");
  });

  it("preserves original casing when stripping", () => {
    const service = createService();

    const result = service._stripContinuationOverlap(
      "FIRMLY clutch The Steering Wheel",
      {
        highlightedCategory: "action.physical",
        contextAfter: "the steering wheel with white knuckles",
      },
    );

    expect(result).toBe("FIRMLY clutch");
  });
});
