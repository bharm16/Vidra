import { VIDEO_MODELS } from "@config/modelConfig";
import { describe, expect, it, vi } from "vitest";
import {
  isKnownGenerationModelInput,
  resolveGenerationModelSelection,
  resolvePromptModelId,
  resolveProviderForGenerationModel,
} from "../videoModelRegistry";

describe("videoModelRegistry", () => {
  it("resolves default generation model when selection is empty/auto", () => {
    expect(resolveGenerationModelSelection(undefined)).toEqual({
      modelId: VIDEO_MODELS.PRO,
      resolvedBy: "default",
    });
    expect(resolveGenerationModelSelection("auto")).toEqual({
      modelId: VIDEO_MODELS.PRO,
      resolvedBy: "default",
    });
    expect(resolveGenerationModelSelection("  ")).toEqual({
      modelId: VIDEO_MODELS.PRO,
      resolvedBy: "default",
    });
  });

  it("resolves model keys and aliases to canonical ids", () => {
    expect(resolveGenerationModelSelection("SORA_2")).toMatchObject({
      modelId: VIDEO_MODELS.SORA_2,
      resolvedBy: "key",
    });

    expect(resolveGenerationModelSelection("sora")).toMatchObject({
      modelId: VIDEO_MODELS.SORA_2,
      resolvedBy: "alias",
    });

    expect(resolveGenerationModelSelection("veo-3")).toMatchObject({
      modelId: VIDEO_MODELS.VEO_3,
      resolvedBy: "alias",
    });
  });

  it("resolves direct canonical model id as resolvedBy=id", () => {
    expect(resolveGenerationModelSelection(VIDEO_MODELS.KLING_V2_1)).toEqual({
      modelId: VIDEO_MODELS.KLING_V2_1,
      resolvedBy: "id",
      requested: VIDEO_MODELS.KLING_V2_1,
    });
  });

  it("falls back to default and logs warning for unknown model selection", () => {
    const warn = vi.fn();
    const result = resolveGenerationModelSelection("non-existent-model", {
      warn,
    });

    expect(result).toEqual({
      modelId: VIDEO_MODELS.PRO,
      resolvedBy: "default",
      requested: "non-existent-model",
    });
    expect(warn).toHaveBeenCalledWith(
      "Unknown video model requested; falling back to default",
      { model: "non-existent-model" },
    );
  });

  it("validates known generation model inputs without resolving to defaults", () => {
    expect(isKnownGenerationModelInput("SORA_2")).toBe(true);
    expect(isKnownGenerationModelInput("sora")).toBe(true);
    expect(isKnownGenerationModelInput(VIDEO_MODELS.SORA_2)).toBe(true);
    expect(isKnownGenerationModelInput("not-a-model")).toBe(false);
    expect(isKnownGenerationModelInput("  ")).toBe(false);
  });

  it("resolves prompt model aliases and passthrough values", () => {
    expect(resolvePromptModelId("kling-v2-1-master")).toBe("kling-2.1");
    expect(resolvePromptModelId("kling-26")).toBe("kling-2.1");
    expect(resolvePromptModelId("veo-4")).toBe("veo-3");
    expect(resolvePromptModelId("veo-3")).toBe("veo-3");
    expect(resolvePromptModelId(" custom-model ")).toBe("custom-model");
    expect(resolvePromptModelId(undefined)).toBeNull();
    expect(resolvePromptModelId("")).toBeNull();
  });

  it("maps canonical generation model ids to provider ids", () => {
    expect(resolveProviderForGenerationModel(VIDEO_MODELS.SORA_2)).toBe(
      "openai",
    );
    expect(resolveProviderForGenerationModel(VIDEO_MODELS.LUMA_RAY3)).toBe(
      "luma",
    );
    expect(resolveProviderForGenerationModel(VIDEO_MODELS.KLING_V2_1)).toBe(
      "kling",
    );
    expect(resolveProviderForGenerationModel(VIDEO_MODELS.VEO_3)).toBe(
      "gemini",
    );
    expect(resolveProviderForGenerationModel(VIDEO_MODELS.PRO)).toBe(
      "replicate",
    );
  });
});
