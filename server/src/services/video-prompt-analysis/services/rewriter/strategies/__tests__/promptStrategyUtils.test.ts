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

describe("buildBaseHeader", () => {
  describe("error handling and edge cases", () => {
    it("omits constraint block when constraints object is empty", () => {
      const result = buildBaseHeader(makeContext({ constraints: {} }));
      expect(result).not.toContain("CONSTRAINTS:");
    });
  });

  describe("constraint formatting", () => {
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
      expect(result).toContain("- HDR");
      expect(result).toContain("- motion");
      expect(result).toContain("- blur");
    });
  });

  describe("core prompt structure", () => {
    it("serializes all IR fields into the output", () => {
      const ir = makeIR({
        subjects: [{ text: "dragon", attributes: ["ancient"] }],
        environment: {
          setting: "mountain peak",
          lighting: ["dramatic"],
          weather: "stormy",
        },
        raw: 'A dragon with "ancient" scales',
      });
      const result = buildBaseHeader(makeContext({ ir }));
      const serialized = result.match(/```json\n([\s\S]*?)\n```/)?.[1];
      expect(serialized).toBeDefined();
      expect(JSON.parse(serialized!)).toEqual(ir);
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
