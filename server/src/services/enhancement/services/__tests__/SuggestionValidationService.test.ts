import { describe, expect, it } from "vitest";
import { SuggestionValidationService } from "../SuggestionValidationService";
import type { VideoService } from "../types";

function createService() {
  const videoPromptService = {
    countWords: (text: string) =>
      text.trim().split(/\s+/).filter(Boolean).length,
  } as unknown as VideoService;

  return new SuggestionValidationService(videoPromptService);
}

describe("SuggestionValidationService", () => {
  it("filters empty, template-like, and multiline suggestions", () => {
    const service = createService();

    const result = service.sanitizeSuggestions(
      [
        { text: "   " },
        { text: "Main prompt rewrite" },
        { text: "Add subtle haze for depth" },
        { text: "Alternative approaches for this section" },
      ],
      {
        highlightedText: "tracking shot",
        isVideoPrompt: true,
        isPlaceholder: false,
      },
    );

    expect(result.map((item) => item.text)).toEqual([
      "Add subtle haze for depth",
    ]);
  });

  it("filters suggestions identical to the highlighted original text", () => {
    const service = createService();

    const result = service.sanitizeSuggestions(
      [{ text: "tracking shot" }, { text: "Dolly in toward the subject" }],
      {
        highlightedText: "tracking shot",
        isVideoPrompt: true,
        isPlaceholder: false,
      },
    );

    expect(result.map((item) => item.text)).toEqual([
      "Dolly in toward the subject",
    ]);
  });

  it("enforces placeholder length/sentence constraints", () => {
    const service = createService();

    const result = service.sanitizeSuggestions(
      [
        { text: "tungsten glow" },
        { text: "this is four words" },
        { text: "single word." },
      ],
      {
        highlightedText: "lighting",
        isVideoPrompt: true,
        isPlaceholder: true,
        videoConstraints: {
          minWords: 1,
          maxWords: 3,
          maxSentences: 1,
          disallowTerminalPunctuation: true,
        },
      },
    );

    expect(result.map((item) => item.text)).toEqual(["tungsten glow"]);
  });

  it("filters suggestions that conflict with locked span categories", () => {
    const service = createService();

    const result = service.sanitizeSuggestions(
      [{ text: "rim light around subject" }, { text: "dolly in past subject" }],
      {
        highlightedText: "camera move",
        highlightedCategory: "camera.movement",
        lockedSpanCategories: ["lighting.quality"],
        isVideoPrompt: true,
        isPlaceholder: false,
      },
    );

    expect(result.map((item) => item.text)).toEqual(["dolly in past subject"]);
  });

  // Composition tests: exercise the ordering gauntlet and inter-step text
  // mutation through the public interface, not just the leaf detectors.

  it("strips a disallowed lead-in prefix and keeps the mutated remainder", () => {
    const service = createService();

    const result = service.sanitizeSuggestions(
      [{ text: "consider a slow dolly in" }],
      {
        highlightedText: "tracking shot",
        highlightedCategory: "camera.movement",
        isVideoPrompt: true,
        isPlaceholder: false,
      },
    );

    expect(result.map((item) => item.text)).toEqual(["a slow dolly in"]);
  });

  it("rejects a suggestion that is nothing but a disallowed prefix", () => {
    const service = createService();

    const result = service.sanitizeSuggestions([{ text: "consider" }], {
      highlightedText: "tracking shot",
      highlightedCategory: "camera.movement",
      isVideoPrompt: true,
      isPlaceholder: false,
    });

    expect(result).toEqual([]);
  });

  it("strips a leading list number and collapses internal whitespace", () => {
    const service = createService();

    const result = service.sanitizeSuggestions(
      [{ text: "2.   Add   subtle  haze for depth" }],
      {
        highlightedText: "tracking shot",
        isVideoPrompt: true,
        isPlaceholder: false,
      },
    );

    expect(result.map((item) => item.text)).toEqual([
      "Add subtle haze for depth",
    ]);
  });

  it("rejects one-clip continuation phrasing only when the prompt is a video prompt", () => {
    const service = createService();
    const suggestions = [{ text: "slowly starts to push in" }];
    const base = {
      highlightedText: "tracking shot",
      highlightedCategory: "camera.movement",
      isPlaceholder: false,
    };

    const asVideo = service.sanitizeSuggestions(suggestions, {
      ...base,
      isVideoPrompt: true,
    });
    const asProse = service.sanitizeSuggestions(suggestions, {
      ...base,
      isVideoPrompt: false,
    });

    expect(asVideo).toEqual([]);
    expect(asProse.map((item) => item.text)).toEqual([
      "slowly starts to push in",
    ]);
  });
});
