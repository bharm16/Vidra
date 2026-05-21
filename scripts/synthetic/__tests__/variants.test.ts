import { describe, expect, it } from "vitest";

import {
  VARIANTS,
  getVariant,
  validateAllPresets,
  VALID_ENV_KEYS,
  type Surface,
} from "../variants.js";

describe("variants registry", () => {
  it("validateAllPresets passes on the seed preset list", () => {
    expect(() => validateAllPresets()).not.toThrow();
  });

  it("every preset has a surface in the legal set", () => {
    const surfaces = new Set<Surface>([
      "suggestions",
      "optimize",
      "span-labeling",
    ]);
    for (const preset of VARIANTS) {
      expect(surfaces.has(preset.surface)).toBe(true);
    }
  });

  it("every preset env key is in the whitelist", () => {
    for (const preset of VARIANTS) {
      for (const key of Object.keys(preset.env)) {
        expect(VALID_ENV_KEYS).toContain(key);
      }
    }
  });

  it("no duplicate (name, surface) pairs", () => {
    const seen = new Set<string>();
    for (const preset of VARIANTS) {
      const key = `${preset.surface}:${preset.name}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });

  it("getVariant returns the preset for a known (name, surface)", () => {
    const found = getVariant("qwen", "suggestions");
    expect(found).toBeDefined();
    expect(found?.name).toBe("qwen");
    expect(found?.surface).toBe("suggestions");
  });

  it("getVariant returns undefined for an unknown name", () => {
    expect(getVariant("nonexistent", "suggestions")).toBeUndefined();
  });

  it("getVariant returns undefined when surface does not match", () => {
    expect(getVariant("qwen", "span-labeling")).toBeUndefined();
  });
});
