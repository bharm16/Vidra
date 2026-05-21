import { describe, expect, it } from "vitest";

import {
  parseMatrixArgs,
  resolveVariants,
  buildChildEnv,
} from "../run-matrix.js";

describe("parseMatrixArgs", () => {
  it("returns surface + variants when both are present", () => {
    const result = parseMatrixArgs([
      "--only",
      "suggestions",
      "--variants",
      "qwen,gemini",
    ]);
    expect(result).toEqual({
      surface: "suggestions",
      variantNames: ["qwen", "gemini"],
      listOnly: false,
    });
  });

  it("returns listOnly=true when --list-variants is passed", () => {
    const result = parseMatrixArgs(["--list-variants"]);
    expect(result.listOnly).toBe(true);
  });

  it("throws on missing --only", () => {
    expect(() => parseMatrixArgs(["--variants", "qwen"])).toThrow(
      /--only is required/i,
    );
  });

  it("throws on missing --variants", () => {
    expect(() => parseMatrixArgs(["--only", "suggestions"])).toThrow(
      /--variants is required/i,
    );
  });

  it("trims whitespace around variant names", () => {
    const result = parseMatrixArgs([
      "--only",
      "suggestions",
      "--variants",
      " qwen , gemini ",
    ]);
    expect(result.variantNames).toEqual(["qwen", "gemini"]);
  });
});

describe("resolveVariants", () => {
  it("returns presets when all names resolve for the surface", () => {
    const resolved = resolveVariants(["qwen", "gemini"], "suggestions");
    expect(resolved).toHaveLength(2);
    expect(resolved[0]!.name).toBe("qwen");
    expect(resolved[1]!.name).toBe("gemini");
  });

  it("throws when a variant name is unknown for the surface", () => {
    expect(() =>
      resolveVariants(["qwen", "nonexistent"], "suggestions"),
    ).toThrow(/unknown variant.*nonexistent.*surface.*suggestions/i);
  });

  it("throws on empty variant list", () => {
    expect(() => resolveVariants([], "suggestions")).toThrow(
      /no variants specified/i,
    );
  });
});

describe("buildChildEnv", () => {
  it("merges preset env on top of base env", () => {
    const base = { POSTHOG_API_KEY: "secret", FOO: "bar" };
    const presetEnv = {
      ENHANCE_PROVIDER: "qwen",
      ENHANCE_MODEL: "qwen/qwen3-32b",
    };
    const merged = buildChildEnv(base, presetEnv);
    expect(merged.POSTHOG_API_KEY).toBe("secret");
    expect(merged.FOO).toBe("bar");
    expect(merged.ENHANCE_PROVIDER).toBe("qwen");
    expect(merged.ENHANCE_MODEL).toBe("qwen/qwen3-32b");
  });

  it("preset env wins over conflicting base env", () => {
    const base = { ENHANCE_PROVIDER: "gemini" };
    const presetEnv = { ENHANCE_PROVIDER: "qwen" };
    const merged = buildChildEnv(base, presetEnv);
    expect(merged.ENHANCE_PROVIDER).toBe("qwen");
  });
});
