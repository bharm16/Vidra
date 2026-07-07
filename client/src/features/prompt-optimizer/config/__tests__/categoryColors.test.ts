import { describe, it, expect } from "vitest";
import { categoryColors } from "../categoryColors";

describe("categoryColors", () => {
  it("has entries for all expected categories", () => {
    const expected = [
      "shot",
      "subject",
      "action",
      "environment",
      "lighting",
      "camera",
      "style",
      "technical",
      "audio",
    ];
    for (const key of expected) {
      expect(categoryColors).toHaveProperty(key);
    }
  });

  // Motion categories (camera, action) are gold — "drives the video, not the
  // picture" (ADR-0010 S2). Their hue is asserted by
  // categoryColors.motion-gold.regression.test.ts, so they are deliberately
  // absent from the warm/cool groupings below.
  it("warm categories use warm hues (red/orange/amber RGB channels)", () => {
    const warmCategories = ["subject", "style"];
    for (const cat of warmCategories) {
      const entry = categoryColors[cat as keyof typeof categoryColors];
      const match = entry.bg.match(/rgba\((\d+),\s*(\d+),\s*(\d+)/);
      expect(match).not.toBeNull();
      if (match) {
        const r = Number(match[1]);
        const b = Number(match[3]);
        expect(r).toBeGreaterThan(b);
      }
    }
  });

  it("cool categories use cool hues (blue/teal RGB channels)", () => {
    const coolCategories = ["lighting", "shot"];
    for (const cat of coolCategories) {
      const entry = categoryColors[cat as keyof typeof categoryColors];
      const match = entry.bg.match(/rgba\((\d+),\s*(\d+),\s*(\d+)/);
      expect(match).not.toBeNull();
      if (match) {
        const b = Number(match[3]);
        const r = Number(match[1]);
        expect(b).toBeGreaterThanOrEqual(r);
      }
    }
  });

  it("each entry has bg, border, and ring properties", () => {
    for (const entry of Object.values(categoryColors)) {
      expect(entry).toHaveProperty("bg");
      expect(entry).toHaveProperty("border");
      expect(entry).toHaveProperty("ring");
      expect(entry.bg).toMatch(/^rgba\(/);
      expect(entry.border).toMatch(/^rgba\(/);
      expect(entry.ring).toMatch(/^rgba\(/);
    }
  });
});
