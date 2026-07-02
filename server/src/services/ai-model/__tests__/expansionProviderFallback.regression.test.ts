import { describe, it, expect } from "vitest";
import { ExecutionPlanResolver } from "../routing/ExecutionPlan";
import { ClientResolver } from "../routing/ClientResolver";
import type { IAIClient } from "@interfaces/IAIClient";

const stubClient = {} as IAIClient;

const EXPANSION_OPERATIONS = [
  "video_prompt_rewrite",
  "video_prompt_ir_extraction",
] as const;

/**
 * The expansion pipeline (video_prompt_ir_extraction + video_prompt_rewrite)
 * was pinned to gemini with strictClient and no fallback. When the gemini
 * key was suspended, /api/optimize silently shipped a deterministic template
 * ("LLM rewrite unavailable") while openai/groq sat healthy in the container.
 */
describe("regression: expansion operations fall back to a healthy provider", () => {
  const resolverWithoutGemini = new ClientResolver({
    openai: stubClient,
    groq: stubClient,
    gemini: null,
    qwen: null,
  });

  it("expansion operations resolve to an available client when gemini is unavailable", () => {
    const planResolver = new ExecutionPlanResolver(resolverWithoutGemini);

    for (const operation of EXPANSION_OPERATIONS) {
      const plan = planResolver.resolve(operation);

      expect(resolverWithoutGemini.hasClient(plan.primaryConfig.client)).toBe(
        true,
      );
    }
  });

  it("expansion operations keep gemini as primary when gemini is available", () => {
    const resolverWithGemini = new ClientResolver({
      openai: stubClient,
      groq: stubClient,
      gemini: stubClient,
      qwen: null,
    });
    const planResolver = new ExecutionPlanResolver(resolverWithGemini);

    for (const operation of EXPANSION_OPERATIONS) {
      const plan = planResolver.resolve(operation);

      expect(plan.primaryConfig.client).toBe("gemini");
    }
  });
});
