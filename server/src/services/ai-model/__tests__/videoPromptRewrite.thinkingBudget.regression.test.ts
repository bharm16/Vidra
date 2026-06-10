/**
 * Regression: the model-targeted rewrite (video_prompt_rewrite, Gemini 2.5)
 * returned prompts truncated mid-sentence. Root cause: Gemini 2.5 thinking
 * tokens count against maxOutputTokens, and no thinkingConfig was sent, so
 * dynamic thinking consumed nearly the whole 8192 budget before any output
 * was produced.
 *
 * Invariant: for any video_prompt_rewrite execution, the request reserves the
 * full output budget for response text (thinking budget pinned to 0). Execution
 * types without a configured budget must keep today's wire shape exactly — no
 * thinkingConfig — because span labeling is eval-gated against blessed
 * baselines (ADR-0001) and any request-flag drift forces a re-bless.
 */
import { describe, expect, it } from "vitest";
import * as fc from "fast-check";

import { AIModelService } from "../AIModelService";
import { GeminiMessageBuilder } from "@clients/adapters/gemini/GeminiMessageBuilder.ts";
import type { CompletionOptions as GeminiCompletionOptions } from "@clients/adapters/gemini/types.ts";
import type { IAIClient } from "@interfaces/IAIClient";

type CapturedOptions = Record<string, unknown> | undefined;

function createCapturingClient(): {
  client: IAIClient;
  getCaptured: () => CapturedOptions;
} {
  let captured: CapturedOptions;
  const client: IAIClient = {
    complete: (_systemPrompt, options) => {
      captured = options as CapturedOptions;
      return Promise.resolve({ text: "a complete sentence.", metadata: {} });
    },
  };
  return { client, getCaptured: () => captured };
}

describe("regression: video_prompt_rewrite reserves its token budget for output", () => {
  it("video_prompt_rewrite executions pin the Gemini thinking budget to 0", async () => {
    const { client, getCaptured } = createCapturingClient();
    const service = new AIModelService({
      clients: { openai: null, gemini: client },
    });

    await service.execute("video_prompt_rewrite", {
      systemPrompt: "Rewrite this prompt for the target model.",
    });

    const options = getCaptured();
    expect(options).toBeDefined();
    expect(options?.thinkingBudget).toBe(0);
  });

  it("for any configured thinking budget, the Gemini payload pins thinkingConfig to it", () => {
    const builder = new GeminiMessageBuilder();

    fc.assert(
      fc.property(fc.integer({ min: 0, max: 16384 }), (budget) => {
        const options: GeminiCompletionOptions & { thinkingBudget?: number } = {
          maxTokens: 8192,
          thinkingBudget: budget,
        };
        const payload = builder.buildPayload("system prompt", options);
        expect(payload.generationConfig.thinkingConfig).toEqual({
          thinkingBudget: budget,
        });
      }),
      { numRuns: 50 },
    );
  });

  it("executions without a configured thinking budget send no thinkingConfig (preserves provider default for eval-gated callers)", () => {
    const builder = new GeminiMessageBuilder();
    const payload = builder.buildPayload("system prompt", {
      maxTokens: 8192,
    });
    expect(payload.generationConfig.thinkingConfig).toBeUndefined();
  });
});
