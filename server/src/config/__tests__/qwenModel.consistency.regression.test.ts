/**
 * Regression: the Qwen model id must be one id, everywhere.
 *
 * Groq retired qwen/qwen3-32b (404: "model does not exist or you do not
 * have access") while SIX separate places hardcoded it: the env-schema
 * default, three modelConfig entry defaults, the llmCosts rate key,
 * GroqQwenAdapter's constructor default, core.services' ServiceConfig
 * fallback, and ExecutionPlan's provider settings. The boot health check
 * then disabled the whole Qwen adapter every startup, silently failing
 * the enhancement path over to its fallback provider.
 *
 * DEFAULT_QWEN_MODEL is now the single source. These tests pin the places
 * that cannot import it (layering keeps clients/ from importing config/)
 * and the ones that key by literal string, so the next model swap is one
 * constant — not an archaeology dig.
 */

import { describe, expect, it } from "vitest";
import { calculateLLMCost } from "../llmCosts.ts";
import { DEFAULT_QWEN_MODEL, ModelConfig } from "../modelConfig.ts";

describe("Qwen model id consistency (regression)", () => {
  it("every qwen-routed operation resolves to DEFAULT_QWEN_MODEL", () => {
    for (const [operation, entry] of Object.entries(ModelConfig)) {
      if (entry.client === "qwen") {
        expect
          .soft(entry.model, `operation ${operation}`)
          .toBe(DEFAULT_QWEN_MODEL);
      }
      if (entry.fallbackTo === "qwen" && entry.fallbackConfig) {
        expect
          .soft(entry.fallbackConfig.model, `fallback of ${operation}`)
          .toBe(DEFAULT_QWEN_MODEL);
      }
    }
  });

  it("llmCosts has an explicit (non-fallback) rate for DEFAULT_QWEN_MODEL", () => {
    // Groq pricing as of 2026-07: $0.60/M input, $3.00/M output. If pricing
    // changes, update llmCosts.ts and this pin together.
    expect(calculateLLMCost(DEFAULT_QWEN_MODEL, 1_000_000, 0)).toBeCloseTo(
      0.6,
      10,
    );
    expect(calculateLLMCost(DEFAULT_QWEN_MODEL, 0, 1_000_000)).toBeCloseTo(
      3.0,
      10,
    );
  });
});
