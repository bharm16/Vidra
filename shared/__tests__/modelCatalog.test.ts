import { describe, expect, it } from "vitest";
import { MODEL_CATALOG } from "../modelCatalog";
import { CANONICAL_PROMPT_MODEL_IDS } from "../videoModels";

describe("modelCatalog", () => {
  it("detection regex matches canonical id keywords for each entry", () => {
    // Smoke test: each entry's primary keyword should match its own indicator
    // regex (or at least match through one of its keywords / markers).
    const probeText: Record<string, string> = {
      "runway-gen45": "runway gen 4.5",
      "luma-ray3": "luma ray-3",
      "kling-2.1": "kling 2.1",
      "sora-2": "sora 2",
      "veo-3": "google veo 3",
      "wan-2.2": "wan 2.2",
    };
    for (const id of CANONICAL_PROMPT_MODEL_IDS) {
      const text = probeText[id];
      expect(text).toBeDefined();
      const patterns = MODEL_CATALOG[id].detectionPatterns;
      expect(patterns.indicators.test(text!)).toBe(true);
    }
  });
});
