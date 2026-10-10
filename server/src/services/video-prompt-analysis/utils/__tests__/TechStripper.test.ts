import { describe, expect, it } from "vitest";
import { TechStripper } from "../TechStripper";

describe("TechStripper", () => {
  const stripper = new TechStripper();

  describe("Tier 1: Universal camera spec stripping", () => {
    it("strips ISO without space", () => {
      const result = stripper.strip("filmed ISO3200 handheld", "sora-2");
      expect(result.text).not.toMatch(/ISO\d/i);
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
    it("defaults to strip for unknown models", () => {
      expect(stripper.shouldStripTokens("unknown-model")).toBe(true);
    });
  });
});
