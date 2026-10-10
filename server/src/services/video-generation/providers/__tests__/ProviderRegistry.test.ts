import { describe, expect, it } from "vitest";
import { VIDEO_MODELS } from "@config/modelConfig";
import { resolveAutoModelId } from "../ProviderRegistry";

describe("ProviderRegistry", () => {
  it("resolves auto-model with replicate highest priority", () => {
    expect(
      resolveAutoModelId({
        openai: false,
        luma: false,
        kling: false,
        replicate: true,
        gemini: true,
      }),
    ).toBe(VIDEO_MODELS.PRO);
  });

  it("resolves auto-model fallback order when replicate unavailable", () => {
    expect(
      resolveAutoModelId({
        openai: false,
        luma: false,
        kling: false,
        replicate: false,
        gemini: true,
      }),
    ).toBe("google/veo-3");
  });

  it("returns null for auto-model when no providers are available", () => {
    expect(
      resolveAutoModelId({
        openai: false,
        luma: false,
        kling: false,
        replicate: false,
        gemini: false,
      }),
    ).toBeNull();
  });
});
