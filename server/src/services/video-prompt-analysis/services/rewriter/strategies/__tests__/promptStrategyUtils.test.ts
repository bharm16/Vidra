import { describe, it, expect } from "vitest";
import { buildBaseHeader } from "../promptStrategyUtils";
import type { PromptBuildContext } from "../types";
import type { VideoPromptIR } from "../../../../types";

const makeIR = (overrides: Partial<VideoPromptIR> = {}): VideoPromptIR => ({
  subjects: [{ text: "a cat", attributes: ["fluffy"] }],
  actions: ["running"],
  camera: { movements: ["pan left"], angle: "low", shotType: "wide" },
  environment: { setting: "forest", lighting: ["natural"] },
  audio: {},
  meta: { mood: ["calm"], style: ["cinematic"] },
  technical: {},
  raw: "a fluffy cat running in a forest",
  ...overrides,
});

const makeContext = (
  overrides: Partial<PromptBuildContext> = {},
): PromptBuildContext => ({
  ir: makeIR(),
  modelId: "test-model",
  constraints: {},
  ...overrides,
});

describe("buildBaseHeader — Sub-project C6 tech-spec tail guard", () => {
  // Sub-project C5 discovered that the compile step's LLM rewriter would
  // sometimes append a parenthetical tech-spec tail like
  // "(5s, 16:9, 24fps, 50mm at" which can be truncated mid-phrase by
  // max_tokens, reproducing the "lens at" fragment Sub-project C thought
  // it eliminated. The buildBaseHeader now carries an OUTPUT FORMAT RULES
  // block forbidding the pattern. This regression test guards against
  // accidental removal.

  it("includes the OUTPUT FORMAT RULES block in every prompt", () => {
    const result = buildBaseHeader(makeContext());
    expect(result).toContain("OUTPUT FORMAT RULES");
  });

  it("explicitly forbids the parenthetical tech-spec tail pattern", () => {
    const result = buildBaseHeader(makeContext());
    expect(result).toContain("DO NOT append a parenthetical");
    expect(result).toContain("tech-spec tail");
  });

  it("requires the prompt to end with completed punctuation", () => {
    const result = buildBaseHeader(makeContext());
    expect(result).toContain("complete sentence terminated by punctuation");
  });
});

describe("buildBaseHeader", () => {
  describe("error handling and edge cases", () => {
    it("omits constraint block when constraints object is empty", () => {
      const result = buildBaseHeader(makeContext({ constraints: {} }));
      expect(result).not.toContain("CONSTRAINTS:");
    });

    it("omits constraint block when all arrays are empty", () => {
      const result = buildBaseHeader(
        makeContext({
          constraints: { mandatory: [], suggested: [], avoid: [] },
        }),
      );
      expect(result).not.toContain("CONSTRAINTS:");
    });

    it("handles IR with empty subjects array", () => {
      const result = buildBaseHeader(
        makeContext({ ir: makeIR({ subjects: [] }) }),
      );
      expect(result).toContain('"subjects": []');
    });

    it("escapes special characters via JSON serialization", () => {
      const result = buildBaseHeader(
        makeContext({ ir: makeIR({ raw: 'text with "quotes" here' }) }),
      );
      expect(result).toContain('text with \\"quotes\\" here');
    });
  });

  describe("constraint formatting", () => {
    it("renders mandatory section with correct header and items", () => {
      const result = buildBaseHeader(
        makeContext({
          constraints: { mandatory: ["HDR", "cinematic lighting"] },
        }),
      );
      expect(result).toContain(
        "MANDATORY CONSTRAINTS (must appear, paraphrased if needed):",
      );
      expect(result).toContain("- HDR");
      expect(result).toContain("- cinematic lighting");
      expect(result).not.toContain("SUGGESTED");
      expect(result).not.toContain("AVOID");
    });

    it("renders suggested section with correct header", () => {
      const result = buildBaseHeader(
        makeContext({ constraints: { suggested: ["slow motion"] } }),
      );
      expect(result).toContain("SUGGESTED CONSTRAINTS (include when natural):");
      expect(result).toContain("- slow motion");
      expect(result).not.toContain("MANDATORY");
    });

    it("renders avoid section with correct header", () => {
      const result = buildBaseHeader(
        makeContext({ constraints: { avoid: ["4k", "8k"] } }),
      );
      expect(result).toContain("AVOID (do not include these words/phrases):");
      expect(result).toContain("- 4k");
      expect(result).not.toContain("MANDATORY");
    });

    it("renders all three sections together", () => {
      const result = buildBaseHeader(
        makeContext({
          constraints: {
            mandatory: ["HDR"],
            suggested: ["motion"],
            avoid: ["blur"],
          },
        }),
      );
      expect(result).toContain("MANDATORY CONSTRAINTS");
      expect(result).toContain("SUGGESTED CONSTRAINTS");
      expect(result).toContain("AVOID");
    });

    it("joins multiple items with newline-dash separators", () => {
      const result = buildBaseHeader(
        makeContext({
          constraints: { mandatory: ["first", "second", "third"] },
        }),
      );
      expect(result).toContain("- first\n- second\n- third");
    });
  });

  describe("core prompt structure", () => {
    it("embeds model ID into the system prompt", () => {
      const result = buildBaseHeader(makeContext({ modelId: "runway-gen45" }));
      expect(result).toContain("runway-gen45 video generation model");
    });

    it("wraps IR in a JSON code fence", () => {
      const result = buildBaseHeader(makeContext());
      expect(result).toContain("```json");
      expect(result).toContain('"subjects"');
    });

    it("includes system role description", () => {
      const result = buildBaseHeader(makeContext());
      expect(result).toContain("professional video prompt engineer");
    });

    it("serializes all IR fields into the output", () => {
      const ir = makeIR({
        subjects: [{ text: "dragon", attributes: ["ancient"] }],
        environment: {
          setting: "mountain peak",
          lighting: ["dramatic"],
          weather: "stormy",
        },
      });
      const result = buildBaseHeader(makeContext({ ir }));
      expect(result).toContain("dragon");
      expect(result).toContain("mountain peak");
      expect(result).toContain("stormy");
    });

    it("produces distinct output for different model IDs", () => {
      const r1 = buildBaseHeader(makeContext({ modelId: "kling-2.1" }));
      const r2 = buildBaseHeader(makeContext({ modelId: "luma-ray3" }));
      expect(r1).toContain("kling-2.1");
      expect(r2).toContain("luma-ray3");
      expect(r1).not.toContain("luma-ray3");
    });
  });
});
