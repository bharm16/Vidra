import { describe, expect, it } from "vitest";
import {
  resolveCanonicalPromptModelId,
  isReleaseGenerationModelSupported,
} from "../videoModels";

describe("videoModels", () => {
  it.each([
    "kling",
    "kling-26",
    "kling-v2-1-master",
    "kling-2.1",
    "luma",
    "luma-ray3",
    "sora-2",
    "sora-2-pro",
    "openai/sora-2",
  ])(
    "keeps %s readable but excludes it from this generation release",
    (model) => {
      if (model !== "sora-2-pro" && model !== "openai/sora-2")
        expect(resolveCanonicalPromptModelId(model)).not.toBeNull();
      expect(isReleaseGenerationModelSupported(model)).toBe(false);
    },
  );

  it.each(["google/veo-3", "wan-video/wan-2.2-i2v-fast"])(
    "does not exclude registered supported model %s",
    (model) => expect(isReleaseGenerationModelSupported(model)).toBe(true),
  );

  it("resolves legacy aliases to canonical ids", () => {
    expect(resolveCanonicalPromptModelId("veo-4")).toBe("veo-3");
    expect(resolveCanonicalPromptModelId("kling-26")).toBe("kling-2.1");
    expect(resolveCanonicalPromptModelId("google/veo-3")).toBe("veo-3");
    expect(resolveCanonicalPromptModelId("kling-v2-1-master")).toBe(
      "kling-2.1",
    );
  });

  it("returns null for unknown ids", () => {
    expect(resolveCanonicalPromptModelId("unknown-model")).toBeNull();
    expect(resolveCanonicalPromptModelId("")).toBeNull();
    expect(resolveCanonicalPromptModelId(null)).toBeNull();
  });
});
