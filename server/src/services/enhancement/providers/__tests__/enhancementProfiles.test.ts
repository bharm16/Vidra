import { describe, it, expect } from "vitest";
import {
  ENHANCEMENT_PROVIDER_PROFILES,
  resolveEnhancementProfile,
} from "../enhancementProfiles";
import type { ProviderType } from "@utils/provider/ProviderDetector";

const ALL_PROVIDERS: ProviderType[] = [
  "openai",
  "groq",
  "qwen",
  "gemini",
  "anthropic",
  "unknown",
];

describe("enhancement provider profiles", () => {
  it("resolves every provider — the lookup is total", () => {
    // The allowlist this replaced ({openai, groq, qwen}) sent everything else
    // down a config-resolved path, reintroducing the router/config divergence
    // it was written to prevent. A total table has no such branch.
    for (const provider of ALL_PROVIDERS) {
      const profile = resolveEnhancementProfile(provider);
      expect(profile).toBeDefined();
      expect(profile.enhancementSchema(false)).toBeDefined();
      expect(profile.customSuggestionSchema()).toBeDefined();
    }
  });

  it("sends strict schemas only to grammar-constrained providers", () => {
    expect(ENHANCEMENT_PROVIDER_PROFILES.openai.strictSchema).toBe(true);
    expect(ENHANCEMENT_PROVIDER_PROFILES.gemini.strictSchema).toBe(true);
    for (const provider of ["groq", "qwen", "anthropic", "unknown"] as const) {
      expect(ENHANCEMENT_PROVIDER_PROFILES[provider].strictSchema).toBe(false);
    }
  });

  it("adds category to required only for placeholder requests", () => {
    for (const provider of ALL_PROVIDERS) {
      const profile = resolveEnhancementProfile(provider);
      const plain = profile.enhancementSchema(false);
      const placeholder = profile.enhancementSchema(true);

      const itemRequired = (schema: typeof plain): string[] =>
        (schema.properties?.suggestions?.items?.required ?? []) as string[];

      expect(itemRequired(plain)).not.toContain("category");
      expect(itemRequired(placeholder)).toContain("category");
    }
  });
});

/**
 * Moved from `utils/provider/schemas/__tests__/enhancement.regression.test.ts`
 * when the if-chain became a profile table. The bug it guards is unchanged.
 */
describe("scene_summary requiredness regression", () => {
  // Bug 2026-05-15: Sub-project B's Groq schema marked scene_summary as
  // required, but Groq's json_object mode (used by Qwen) does not honor
  // required-arrays the way OpenAI strict mode does. Our own
  // validateStructuredOutput rejected ~30% of valid suggestion arrays
  // because Qwen dropped the field. The invariant: the loose schema declares
  // scene_summary in properties (documentation) but NOT in required —
  // the prompt drives emission and the engine tolerates absence.
  it("does not require scene_summary in the loose (Groq) schema", () => {
    const schema = resolveEnhancementProfile("groq").enhancementSchema(false);
    expect(schema.type).toBe("object");
    expect(schema.required).toEqual(["suggestions"]);
    expect(schema.properties?.scene_summary).toBeDefined();
  });

  // OpenAI strict mode honors required-arrays via grammar-constrained
  // decoding — the model literally cannot emit output missing the field.
  it("requires scene_summary in the strict (OpenAI) schema", () => {
    const schema = resolveEnhancementProfile("openai").enhancementSchema(false);
    expect(schema.type).toBe("object");
    expect(schema.required).toEqual(["scene_summary", "suggestions"]);
    expect(schema.strict).toBe(true);
  });

  it("keeps the same asymmetry on the custom-suggestion path", () => {
    // Qwen drops scene_summary ~60% of the time here.
    expect(
      resolveEnhancementProfile("groq").customSuggestionSchema().required,
    ).toEqual(["suggestions"]);
    expect(
      resolveEnhancementProfile("openai").customSuggestionSchema().required,
    ).toEqual(["scene_summary", "suggestions"]);
  });
});
