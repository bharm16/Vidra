import { describe, it, expect } from "vitest";
import { defaultPromptStrategy } from "../DefaultPromptStrategy";
import { kling26PromptStrategy } from "../Kling26PromptStrategy";
import { lumaRay3PromptStrategy } from "../LumaRay3PromptStrategy";
import { runwayGen45PromptStrategy } from "../RunwayGen45PromptStrategy";
import { sora2PromptStrategy } from "../Sora2PromptStrategy";
import { veo4PromptStrategy } from "../Veo4PromptStrategy";
import { wan22PromptStrategy } from "../Wan22PromptStrategy";
import type { PromptBuildContext } from "../types";
import type { VideoPromptIR } from "../../../../types";

const makeIR = (): VideoPromptIR => ({
  subjects: [{ text: "a woman", attributes: ["elegant"] }],
  actions: ["walking"],
  camera: { movements: ["dolly in"] },
  environment: { setting: "garden", lighting: ["soft"] },
  audio: {},
  meta: { mood: ["serene"], style: ["cinematic"] },
  technical: {},
  raw: "an elegant woman walking in a garden",
});

const makeContext = (
  overrides: Partial<PromptBuildContext> = {},
): PromptBuildContext => ({
  ir: makeIR(),
  modelId: "test",
  constraints: { mandatory: ["HDR"] },
  ...overrides,
});

const ALL_STRATEGIES = [
  defaultPromptStrategy,
  kling26PromptStrategy,
  lumaRay3PromptStrategy,
  runwayGen45PromptStrategy,
  sora2PromptStrategy,
  veo4PromptStrategy,
  wan22PromptStrategy,
];

describe("Model Prompt Strategies", () => {
  describe("constraint passthrough from context", () => {
    it("all strategies include mandatory constraint block from context", () => {
      const ctx = makeContext();
      for (const strategy of ALL_STRATEGIES) {
        const result = strategy.buildPrompt(ctx);
        expect(result).toContain("MANDATORY CONSTRAINTS");
        expect(result).toContain("- HDR");
      }
    });

    it("all strategies include IR JSON in output", () => {
      const ctx = makeContext();
      for (const strategy of ALL_STRATEGIES) {
        const result = strategy.buildPrompt(ctx);
        expect(result).toContain('"subjects"');
        expect(result).toContain("elegant");
      }
    });
  });
});
