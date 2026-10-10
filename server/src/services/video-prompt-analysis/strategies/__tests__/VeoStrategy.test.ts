import { beforeEach, describe, expect, it, vi } from "vitest";
import { VeoStrategy } from "../VeoStrategy";
import type { PromptOptimizationResult, VideoPromptIR } from "../types";

vi.mock("../../utils/TechStripper", () => ({
  TechStripper: class {
    strip(text: string) {
      return { text, tokensWereStripped: false, strippedTokens: [] };
    }
  },
  techStripper: {
    strip(text: string) {
      return { text, tokensWereStripped: false, strippedTokens: [] };
    },
  },
}));
vi.mock("../../utils/SafetySanitizer", () => ({
  SafetySanitizer: class {
    sanitize(text: string) {
      return { text, wasModified: false, replacements: [] };
    }
  },
  safetySanitizer: {
    sanitize(text: string) {
      return { text, wasModified: false, replacements: [] };
    },
  },
}));

const makeResult = (prompt: string): PromptOptimizationResult => ({
  prompt,
  metadata: {
    modelId: "veo-3",
    pipelineVersion: "2.0.0",
    phases: [],
    warnings: [],
    tokensStripped: [],
    triggersInjected: [],
  },
});

const makeIr = (): VideoPromptIR => ({
  subjects: [{ text: "a cyclist", attributes: ["red jacket"] }],
  actions: ["riding through a wet street"],
  camera: { movements: ["dolly in"], shotType: "medium shot" },
  environment: { setting: "night city", lighting: ["neon reflections"] },
  audio: {},
  meta: { mood: ["dramatic"], style: ["cinematic"] },
  technical: {},
  raw: "a cyclist riding through a wet street at night",
});

describe("VeoStrategy", () => {
  let strategy: VeoStrategy;

  beforeEach(() => {
    strategy = new VeoStrategy({
      analyzer: { analyze: vi.fn(async () => makeIr()) } as never,
      llmRewriter: {
        rewrite: vi.fn(
          async () =>
            "a cyclist riding with dynamic camera movement, lit by moody neon reflections",
        ),
      } as never,
    });
  });

  it("normalizes conversational filler", () => {
    const normalized = strategy.normalize(
      "please create a cinematic city chase",
    );
    expect(normalized.toLowerCase()).not.toContain("please create");
    expect(normalized).toContain("cinematic");
  });

  it("transforms to cinematic prose string (not JSON)", async () => {
    strategy.normalize("a cyclist riding through a wet street at night");
    const transformed = await strategy.transform(
      "a cyclist riding through a wet street at night",
    );
    expect(typeof transformed.prompt).toBe("string");
    expect((transformed.prompt as string).toLowerCase()).toContain("camera");
    expect((transformed.prompt as string).toLowerCase()).toContain("lit by");
  });

  it("does not inject style when no style keyword is detected", () => {
    strategy.normalize("test prompt");
    const augmented = strategy.augment(
      makeResult("A medium shot of a cyclist on a wet street."),
    );
    expect(typeof augmented.prompt).toBe("string");
    // Should NOT force a template-style "Style reference:" when no keyword is present
    expect((augmented.prompt as string).toLowerCase()).not.toContain(
      "style reference",
    );
  });

  it("expands bare style keyword inline when detected", () => {
    strategy.normalize("test prompt");
    const augmented = strategy.augment(
      makeResult("A cinematic shot of a cyclist on a wet street."),
    );
    expect(typeof augmented.prompt).toBe("string");
    // Should expand "cinematic" with richer vocabulary inline, not as "Style reference:"
    expect((augmented.prompt as string).toLowerCase()).not.toContain(
      "style reference:",
    );
    expect((augmented.prompt as string).toLowerCase()).toContain(
      "naturalistic lighting",
    );
  });
});
