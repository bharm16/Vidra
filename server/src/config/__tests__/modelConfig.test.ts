import { describe, expect, it } from "vitest";
import {
  DEFAULT_CONFIG,
  ModelConfig,
  VIDEO_MODELS,
  getModelConfig,
  isOperationName,
  listOperations,
  shouldUseDeveloperMessage,
  shouldUseSeed,
} from "../modelConfig";

describe("modelConfig", () => {
  it("returns operation-specific config when available", () => {
    const config = getModelConfig("optimize_standard");

    expect(config).toBe(ModelConfig.optimize_standard);
    expect(config.model).toBeDefined();
  });

  it("resolves every configured operation to its own entry, never DEFAULT_CONFIG", () => {
    for (const operation of listOperations()) {
      expect(isOperationName(operation)).toBe(true);
      if (!isOperationName(operation)) continue;

      expect(getModelConfig(operation)).toBe(ModelConfig[operation]);
      expect(getModelConfig(operation)).not.toBe(DEFAULT_CONFIG);
    }
  });

  it("lists configured operations", () => {
    const operations = listOperations();

    expect(operations.length).toBeGreaterThan(0);
    expect(operations).toContain("optimize_standard");
    expect(operations).toContain("span_labeling");
    expect(operations).toContain("video_prompt_ir_extraction");
    expect(operations).toContain("video_prompt_rewrite");
  });

  it("reports seed and developer message flags from operation config", () => {
    expect(shouldUseSeed("optimize_shot_interpreter")).toBe(true);
    expect(shouldUseSeed("enhance_suggestions")).toBe(false);
    expect(shouldUseDeveloperMessage("optimize_standard")).toBe(true);
    expect(shouldUseDeveloperMessage("span_labeling")).toBe(false);
  });

  it("exports expected video model identifiers", () => {
    expect(VIDEO_MODELS.DRAFT).toBeDefined();
    expect(VIDEO_MODELS.PRO).toBeDefined();
    expect(VIDEO_MODELS.SORA_2).toBe("sora-2");
    expect(VIDEO_MODELS.VEO_3).toBe("google/veo-3");
  });
});
