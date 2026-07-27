import { describe, expect, it } from "vitest";
import { TechStripper } from "../TechStripper";

describe("TechStripper", () => {
  const stripper = new TechStripper();

  describe("Tier 1: Universal camera spec stripping", () => {
    it("strips single f-stop values", () => {
      const result = stripper.strip(
        "shot at f/2.8 with natural light",
        "runway-gen45",
      );
      expect(result.text).not.toMatch(/f\/\d/);
      expect(result.text).toContain("natural light");
      expect(result.tokensWereStripped).toBe(true);
      expect(result.strippedTokens).toContain("f-stop");
    });

    it("strips f-stop range in parentheses", () => {
      const result = stripper.strip(
        "shallow focus (f/1.8-f/2.8) on the subject",
        "veo-4",
      );
      expect(result.text).not.toMatch(/f\/\d/);
      expect(result.text).toContain("shallow focus");
      expect(result.text).toContain("on the subject");
    });

    it("strips f-stop with spaces around slash", () => {
      const result = stripper.strip("shot at f / 2.8 closeup", "luma-ray3");
      expect(result.text).not.toMatch(/f\s*\/\s*\d/);
    });

    it("strips ISO values", () => {
      const result = stripper.strip("shot at ISO 800 in low light", "kling-26");
      expect(result.text).not.toMatch(/ISO\s*\d/i);
      expect(result.text).toContain("low light");
      expect(result.strippedTokens).toContain("ISO");
    });

    it("strips ISO without space", () => {
      const result = stripper.strip("filmed ISO3200 handheld", "sora-2");
      expect(result.text).not.toMatch(/ISO\d/i);
    });

    it("strips camera specs for ALL models (universal)", () => {
      const models = [
        "runway-gen45",
        "luma-ray3",
        "kling-26",
        "veo-4",
        "sora-2",
        "wan-22",
      ];
      for (const modelId of models) {
        const result = stripper.strip("f/1.8 ISO 800 cinematic shot", modelId);
        expect(result.text).not.toMatch(/f\/\d/);
        expect(result.text).not.toMatch(/ISO\s*\d/i);
        expect(result.tokensWereStripped).toBe(true);
      }
    });

    it("cleans up whitespace after stripping", () => {
      const result = stripper.strip("a f/2.8 cinematic shot", "runway-gen45");
      expect(result.text).not.toContain("  ");
    });
  });

  describe("Tier 2: Model-aware placebo token stripping", () => {
    it("strips placebo tokens for runway-gen45", () => {
      const result = stripper.strip(
        "4k ultra hd masterpiece cinematic shot",
        "runway-gen45",
      );
      expect(result.text).not.toMatch(/\b4k\b/i);
      expect(result.text).not.toMatch(/\bultra hd\b/i);
      expect(result.text).not.toMatch(/\bmasterpiece\b/i);
      expect(result.text).toContain("cinematic shot");
    });

    it("strips placebo tokens for luma-ray3", () => {
      const result = stripper.strip(
        "8k hdr trending on artstation",
        "luma-ray3",
      );
      expect(result.text).not.toMatch(/\b8k\b/i);
      expect(result.text).not.toMatch(/\bhdr\b/i);
    });

    it("keeps placebo tokens for kling-2.1", () => {
      const result = stripper.strip(
        "4k ultra hd masterpiece cinematic",
        "kling-2.1",
      );
      expect(result.text).toContain("4k");
      expect(result.text).toContain("masterpiece");
    });

    it("keeps placebo tokens for veo-3", () => {
      const result = stripper.strip("8k hdr best quality landscape", "veo-3");
      expect(result.text).toContain("8k");
      expect(result.text).toContain("hdr");
    });

    it("keeps placebo tokens for sora-2", () => {
      const result = stripper.strip("4k highly detailed city", "sora-2");
      expect(result.text).toContain("4k");
      expect(result.text).toContain("highly detailed");
    });
  });

  describe("both tiers combined", () => {
    it("strips camera specs AND placebo tokens for strip-models", () => {
      const result = stripper.strip(
        "f/2.8 ISO 800 4k masterpiece cinematic",
        "runway-gen45",
      );
      expect(result.text).not.toMatch(/f\/\d/);
      expect(result.text).not.toMatch(/ISO\s*\d/i);
      expect(result.text).not.toMatch(/\b4k\b/i);
      expect(result.text).not.toMatch(/\bmasterpiece\b/i);
      expect(result.text).toContain("cinematic");
    });

    it("strips camera specs but keeps placebo tokens for keep-models", () => {
      const result = stripper.strip(
        "f/2.8 ISO 800 4k masterpiece cinematic",
        "kling-2.1",
      );
      expect(result.text).not.toMatch(/f\/\d/);
      expect(result.text).not.toMatch(/ISO\s*\d/i);
      expect(result.text).toContain("4k");
      expect(result.text).toContain("masterpiece");
      expect(result.text).toContain("cinematic");
    });
  });

  describe("no-op when nothing to strip", () => {
    it("returns original text unchanged when no tokens match", () => {
      const input = "a cinematic tracking shot of a runner";
      const result = stripper.strip(input, "runway-gen45");
      expect(result.text).toBe(input);
      expect(result.tokensWereStripped).toBe(false);
      expect(result.strippedTokens).toEqual([]);
    });
  });

  describe("shouldStripTokens", () => {
    it("returns true for strip-models", () => {
      expect(stripper.shouldStripTokens("runway-gen45")).toBe(true);
      expect(stripper.shouldStripTokens("luma-ray3")).toBe(true);
      expect(stripper.shouldStripTokens("wan-2.2")).toBe(true);
    });

    it("returns false for keep-models", () => {
      expect(stripper.shouldStripTokens("kling-2.1")).toBe(false);
      expect(stripper.shouldStripTokens("veo-3")).toBe(false);
      expect(stripper.shouldStripTokens("sora-2")).toBe(false);
    });

    it("resolves legacy aliases to the canonical policy", () => {
      expect(stripper.shouldStripTokens("kling-26")).toBe(false);
      expect(stripper.shouldStripTokens("veo-4")).toBe(false);
    });

    it("defaults to strip for unknown models", () => {
      expect(stripper.shouldStripTokens("unknown-model")).toBe(true);
    });
  });

  describe("isPlaceboToken", () => {
    it("identifies placebo tokens", () => {
      expect(stripper.isPlaceboToken("4k")).toBe(true);
      expect(stripper.isPlaceboToken("masterpiece")).toBe(true);
      expect(stripper.isPlaceboToken("ULTRA HD")).toBe(true);
    });

    it("rejects non-placebo tokens", () => {
      expect(stripper.isPlaceboToken("cinematic")).toBe(false);
      expect(stripper.isPlaceboToken("bokeh")).toBe(false);
    });
  });
});
