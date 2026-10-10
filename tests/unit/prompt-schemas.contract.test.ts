import { describe, expect, it } from "vitest";

import {
  compileSchema,
  promptSchema,
  suggestionSchema,
  customSuggestionSchema,
  sceneChangeSchema,
} from "@config/schemas";

describe("prompt schemas contract", () => {
  it("accepts a valid prompt optimization request", () => {
    const result = promptSchema.safeParse({
      prompt: "A cinematic dolly-in through a rainy neon alley.",
      targetModel: "sora-2",
      lockedSpans: [{ text: "neon alley", category: "environment.location" }],
      generationParams: { fps: 24, duration_s: 6 },
    });

    expect(result.success).toBe(true);
  });

  it("rejects invalid prompt optimization payloads", () => {
    const invalidMode = promptSchema.safeParse({
      prompt: "A cinematic scene",
      mode: "audio",
    });
    const emptyPrompt = promptSchema.safeParse({
      prompt: "",
      mode: "video",
    });

    expect(invalidMode.success).toBe(false);
    expect(emptyPrompt.success).toBe(false);
  });

  it("enforces compile contract for target model", () => {
    expect(
      compileSchema.safeParse({
        prompt: "A cinematic scene",
        targetModel: "sora-2",
      }).success,
    ).toBe(true);

    expect(
      compileSchema.safeParse({
        artifactKey: "prompt-opt-v5::structured-artifact::abc123",
        targetModel: "sora-2",
      }).success,
    ).toBe(true);

    expect(
      compileSchema.safeParse({
        targetModel: "sora-2",
      }).success,
    ).toBe(false);
  });
});

describe("suggestion schemas contract", () => {
  it("accepts a valid enhancement suggestion payload", () => {
    const result = suggestionSchema.safeParse({
      highlightedText: "golden hour light",
      fullPrompt: "A woman walks down the street in golden hour light.",
      highlightedCategory: "lighting",
      allLabeledSpans: [
        {
          text: "golden hour light",
          role: "lighting",
          start: 30,
          end: 47,
          confidence: 0.9,
        },
      ],
      brainstormContext: {
        version: "1",
        elements: { subject: "woman", action: "walking" },
      },
    });

    expect(result.success).toBe(true);
  });

  it("rejects invalid suggestion payloads", () => {
    const missingHighlightedText = suggestionSchema.safeParse({
      highlightedText: "",
      fullPrompt: "A full prompt",
    });
    const tooManyHistoryEntries = suggestionSchema.safeParse({
      highlightedText: "hero",
      fullPrompt: "A full prompt",
      editHistory: Array.from({ length: 51 }).map((_, index) => ({
        original: `o-${index}`,
        replacement: `r-${index}`,
      })),
    });

    expect(missingHighlightedText.success).toBe(false);
    expect(tooManyHistoryEntries.success).toBe(false);
  });

  it("validates custom suggestion, scene change, and coherence-check contracts", () => {
    expect(
      customSuggestionSchema.safeParse({
        highlightedText: "hero",
        customRequest: "Make this more cinematic",
        fullPrompt: "A hero runs through rain.",
      }).success,
    ).toBe(true);
    expect(
      customSuggestionSchema.safeParse({
        highlightedText: "hero",
        fullPrompt: "A hero runs through rain.",
      }).success,
    ).toBe(false);

    expect(
      sceneChangeSchema.safeParse({
        changedField: "lighting",
        newValue: "moonlit",
        fullPrompt: "A hero runs through rain.",
      }).success,
    ).toBe(true);
  });
});
