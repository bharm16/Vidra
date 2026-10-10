import { describe, expect, it } from "vitest";
import * as fc from "fast-check";
import { LumaStrategy } from "../LumaStrategy";
import {
  BaseStrategy,
  type AugmentResult,
  type NormalizeResult,
  type TransformResult,
} from "../BaseStrategy";
import type {
  PromptContext,
  PromptOptimizationResult,
  VideoPromptIR,
} from "../types";

const SENTENCE_TERMINATORS = [".", "!", "?"];

const makeResult = (prompt: string): PromptOptimizationResult => ({
  prompt,
  metadata: {
    modelId: "luma-ray3",
    pipelineVersion: "2.0.0",
    phases: [],
    warnings: [],
    tokensStripped: [],
    triggersInjected: [],
  },
});

// Synthetic rewrite prose: every sentence carries terminal punctuation, so a
// sentence boundary always exists inside the word budget. This mirrors the
// multi-sentence cinematic paragraphs the video_prompt_rewrite LLM produces.
const VOCABULARY = [
  "warm",
  "light",
  "slowly",
  "pans",
  "across",
  "cozy",
  "interior",
  "coffee",
  "shop",
  "soft",
  "shadows",
  "window",
  "morning",
  "steam",
  "rises",
  "gently",
  "barista",
  "pours",
  "milk",
  "golden",
  "glow",
];

const sentenceArb = fc
  .array(fc.constantFrom(...VOCABULARY), { minLength: 8, maxLength: 16 })
  .map((words) => `${words.join(" ")}.`);

// >= 16 sentences x >= 8 words guarantees the prose exceeds Luma's
// 120-word budget, forcing enforcePromptBudget to trim.
const oversizedProseArb = fc
  .array(sentenceArb, { minLength: 16, maxLength: 30 })
  .map((sentences) => sentences.join(" "));

describe("regression: budget enforcement never ends a prompt mid-sentence", () => {
  it("over-budget multi-sentence rewrites are trimmed to a sentence boundary within the word budget", () => {
    fc.assert(
      fc.property(oversizedProseArb, (prose) => {
        const strategy = new LumaStrategy();
        strategy.normalize("warmup");

        const result = strategy.augment(makeResult(prose));
        const prompt = (result.prompt as string).trim();
        const wordCount = prompt.split(/\s+/).filter(Boolean).length;

        expect(wordCount).toBeLessThanOrEqual(120);
        expect(SENTENCE_TERMINATORS).toContain(prompt.at(-1));
      }),
      { numRuns: 100 },
    );
  });
});

// Guard for the trigger-preserving path: trimming the body to a sentence
// boundary must not introduce "., trigger" artifacts or drop triggers.
class TriggerInjectingStrategy extends BaseStrategy {
  readonly modelId = "sentence-boundary-test";
  readonly modelName = "Sentence Boundary Test";

  getModelConstraints() {
    return {
      wordLimits: { min: 1, max: 24 },
      triggerBudgetWords: 6,
    };
  }

  protected async doValidate(
    _input: string,
    _context?: PromptContext,
  ): Promise<void> {}

  protected doNormalize(input: string): NormalizeResult {
    return { text: input, changes: [], strippedTokens: [] };
  }

  protected doTransform(
    llmPrompt: string | Record<string, unknown>,
    _ir: VideoPromptIR,
  ): TransformResult {
    return {
      prompt:
        typeof llmPrompt === "string" ? llmPrompt : JSON.stringify(llmPrompt),
      changes: [],
    };
  }

  protected doAugment(result: PromptOptimizationResult): AugmentResult {
    const basePrompt =
      typeof result.prompt === "string"
        ? result.prompt
        : JSON.stringify(result.prompt);
    const enforced = this.enforceMandatoryConstraints(basePrompt, [
      "cinematic hdr",
      "volumetric glow",
    ]);

    return {
      prompt: enforced.prompt,
      changes: enforced.changes,
      triggersInjected: enforced.injected,
    };
  }
}

describe("regression: sentence-aware trimming preserves mandatory triggers cleanly", () => {
  it("keeps triggers at the end without sentence-punctuation-comma artifacts", () => {
    fc.assert(
      fc.property(oversizedProseArb, (prose) => {
        const strategy = new TriggerInjectingStrategy();
        strategy.normalize("warmup");

        const result = strategy.augment(makeResult(prose));
        const prompt = (result.prompt as string).trim();
        const wordCount = prompt.split(/\s+/).filter(Boolean).length;

        expect(prompt.endsWith("volumetric glow")).toBe(true);
        expect(prompt).toContain("cinematic hdr");
        expect(wordCount).toBeLessThanOrEqual(24);
        for (const artifact of [".,", "!,", "?,"]) {
          expect(prompt).not.toContain(artifact);
        }
      }),
      { numRuns: 50 },
    );
  });
});
