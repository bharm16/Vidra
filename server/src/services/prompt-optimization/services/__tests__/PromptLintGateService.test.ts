import { describe, expect, it, vi } from "vitest";
import { PromptLintGateService } from "../PromptLintGateService";

describe("PromptLintGateService", () => {
  const service = new PromptLintGateService({
    getModelConstraints: (modelId) =>
      modelId === "wan-2.2"
        ? { wordLimits: { min: 30, max: 60 }, triggerBudgetWords: 10 }
        : undefined,
  });

  it("fails lint for technical specs markdown artifacts", () => {
    const lint = service.evaluate(
      "Scene text\n\n**TECHNICAL SPECS**\n- Duration: 8s",
    );
    expect(lint.ok).toBe(false);
    expect(lint.errors.some((error) => error.includes("technical specs"))).toBe(
      true,
    );
  });

  it("sanitizes markdown artifacts", () => {
    const result = service.sanitize({
      prompt: "Scene text\n\n**ALTERNATIVE APPROACHES**\n- Variation 1: ...",
    });
    expect(result.prompt).toBe("Scene text");
    expect(result.repaired).toBe(true);
  });

  // The one lint outcome with a downstream cost: the provider truncates after
  // the spend. Typed so a caller can act on it without parsing an error string.
  it("reports a budget overrun as a typed outcome", () => {
    const result = service.sanitize({
      prompt: new Array(120).fill("word").join(" "),
      modelId: "wan-2.2",
    });

    expect(result.lint.overBudget).toEqual({
      modelId: "wan-2.2",
      wordCount: 120,
      limit: 60,
    });
  });

  it("leaves overBudget unset for a prompt inside the budget", () => {
    const result = service.sanitize({
      prompt: new Array(40).fill("word").join(" "),
      modelId: "wan-2.2",
    });

    expect(result.lint.overBudget).toBeUndefined();
    expect(result.lint.ok).toBe(true);
  });
});
