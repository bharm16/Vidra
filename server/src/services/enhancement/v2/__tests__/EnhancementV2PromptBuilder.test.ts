import { describe, expect, it } from "vitest";

import { EnhancementV2PromptBuilder } from "../EnhancementV2PromptBuilder.js";
import type { EnhancementV2RequestContext, SlotPolicy } from "../types.js";

function makeContext(
  overrides: Partial<EnhancementV2RequestContext> = {},
): EnhancementV2RequestContext {
  return {
    highlightedText: "aerial",
    contextBefore: "Wide ",
    contextAfter: " shot at dusk",
    fullPrompt: "Wide aerial shot at dusk",
    originalUserPrompt: "Wide aerial shot at dusk",
    brainstormContext: null,
    highlightedCategory: "camera.angle",
    highlightedCategoryConfidence: 0.9,
    isPlaceholder: false,
    isVideoPrompt: true,
    phraseRole: null,
    highlightWordCount: 1,
    videoConstraints: null,
    modelTarget: null,
    promptSection: null,
    spanAnchors: "",
    nearbySpanHints: "",
    lockedSpanCategories: [],
    debug: false,
    ...overrides,
  };
}

function makePolicy(overrides: Partial<SlotPolicy> = {}): SlotPolicy {
  return {
    categoryId: "camera.angle",
    mode: "guided_llm",
    grammar: { kind: "noun_phrase", minWords: 1, maxWords: 5 },
    targetCount: 4,
    minAcceptableCount: 2,
    requiredFamilies: [],
    forbiddenFamilies: [],
    promptGuidance: "Stay inside camera.angle.",
    ...overrides,
  };
}

describe("EnhancementV2PromptBuilder — imperative + one-shot scene_summary", () => {
  const builder = new EnhancementV2PromptBuilder();

  describe("buildPrompt (regular path)", () => {
    it("contains the imperative 'MUST emit scene_summary FIRST' phrase", () => {
      const prompt = builder.buildPrompt(makeContext(), makePolicy());
      expect(prompt).toContain("MUST emit `scene_summary` FIRST");
    });

    it("includes a one-shot EXAMPLE block demonstrating the JSON shape", () => {
      const prompt = builder.buildPrompt(makeContext(), makePolicy());
      expect(prompt).toContain("EXAMPLE");
      expect(prompt).toContain('"scene_summary": "Dusk aerial');
      // The example uses suggestions[] so the LLM sees the field-order shape.
      expect(prompt).toContain('"suggestions":');
    });

    it("uses the 'MUST be the first key' format-reinforcement line", () => {
      const prompt = builder.buildPrompt(makeContext(), makePolicy());
      expect(prompt).toContain("MUST be the first key");
    });
  });

  describe("buildPrompt routing to buildCustomPrompt (custom-request path)", () => {
    it("contains the imperative 'MUST emit scene_summary FIRST' phrase on custom requests", () => {
      const prompt = builder.buildPrompt(
        makeContext({
          customRequest: "Make these sound dreamier",
        }),
        makePolicy(),
      );
      expect(prompt).toContain("MUST emit `scene_summary` FIRST");
    });

    it("includes the one-shot EXAMPLE block on custom requests", () => {
      const prompt = builder.buildPrompt(
        makeContext({
          customRequest: "Make these sound dreamier",
        }),
        makePolicy(),
      );
      expect(prompt).toContain("EXAMPLE");
      expect(prompt).toContain('"scene_summary": "Dusk aerial');
    });
  });

  describe("buildPrompt motion-vocabulary bias (D6)", () => {
    it("folds camera-motion vocabulary into the prompt for a camera-movement span", () => {
      const prompt = builder.buildPrompt(
        makeContext({ highlightedCategory: "camera.movement" }),
        makePolicy({ categoryId: "camera.movement" }),
      );
      expect(prompt).toContain("camera-move vocabulary");
      expect(prompt).toContain("dolly");
    });

    it("folds subject-motion vocabulary into the prompt for an action span", () => {
      const prompt = builder.buildPrompt(
        makeContext({ highlightedCategory: "action" }),
        makePolicy({ categoryId: "action" }),
      );
      expect(prompt).toContain("action vocabulary");
      expect(prompt).toContain("gesturing");
    });

    it("adds no motion vocabulary for a still-picture span", () => {
      const prompt = builder.buildPrompt(
        makeContext({ highlightedCategory: "shot.type" }),
        makePolicy({ categoryId: "shot.type" }),
      );
      expect(prompt).not.toContain("camera-move vocabulary");
      expect(prompt).not.toContain("action vocabulary");
    });
  });
});
