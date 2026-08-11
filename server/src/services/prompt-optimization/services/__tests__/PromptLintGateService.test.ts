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

  it("returns unchanged model-specific prompts that exceed the budget and reports lint", () => {
    const longPrompt = new Array(120).fill("word").join(" ");
    const logError = vi.fn();
    (service as unknown as { log: { error: typeof logError } }).log = {
      error: logError,
    } as never;

    const result = service.sanitize({
      prompt: longPrompt,
      modelId: "wan-2.2",
    });

    expect(result.prompt).toBe(longPrompt);
    expect(result.lint.ok).toBe(false);
    expect(result.lint.errors).toContain(
      "Prompt too long for wan-2.2 (120 words > 60).",
    );
    expect(logError).toHaveBeenCalled();
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

  it("leaves overBudget unset when no model constrains the prompt", () => {
    const result = service.sanitize({
      prompt: new Array(400).fill("word").join(" "),
    });

    expect(result.lint.overBudget).toBeUndefined();
  });
});
