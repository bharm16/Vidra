import { describe, expect, it, vi } from "vitest";
import { PromptLintGateService } from "../PromptLintGateService";

describe("regression: lint enforcement is non-fatal (sanitize-then-warn)", () => {
  const createService = () =>
    new PromptLintGateService({
      getModelConstraints: (modelId) =>
        modelId === "wan-2.2"
          ? { wordLimits: { min: 30, max: 60 }, triggerBudgetWords: 10 }
          : undefined,
    });

  it("logs and returns unchanged model-specific prompts when only the word budget is exceeded", () => {
    const service = createService();
    const logError = vi.fn();
    (service as unknown as { log: { error: typeof logError } }).log = {
      error: logError,
    } as never;
    const longPrompt = new Array(75).fill("word").join(" ");

    const result = service.sanitize({
      prompt: longPrompt,
      modelId: "wan-2.2",
    });

    expect(result.prompt).toBe(longPrompt);
    expect(result.lint.ok).toBe(false);
    expect(result.lint.errors).toEqual([
      "Prompt too long for wan-2.2 (75 words > 60).",
    ]);
    expect(logError).toHaveBeenCalledTimes(1);
  });

  // Inverted invariant (was "still fails ..."): sanitize-then-warn now applies
  // to non-length errors too. A residual markdown heading after sanitize must
  // NOT throw — that produces a post-spend 500 after a successful LLM call.
  // The user gets a delivered prompt + structured warn log instead.
  it("does NOT throw when a residual markdown heading survives sanitation", () => {
    const service = createService();
    const logWarn = vi.fn();
    (service as unknown as { log: { warn: typeof logWarn } }).log = {
      warn: logWarn,
    } as never;

    let result;
    expect(() => {
      result = service.sanitize({
        prompt: "# Heading\nThis should not 500 the request.",
        modelId: "wan-2.2",
      });
    }).not.toThrow();

    expect(result).toBeDefined();
    expect(result!.lint.ok).toBe(false);
    expect(result!.lint.errors).toContain("Contains markdown heading syntax.");
    expect(result!.prompt.length).toBeGreaterThan(0);
    expect(logWarn).toHaveBeenCalledTimes(1);
  });

  it("does NOT throw when a 'Variation N' artifact survives sanitation", () => {
    const service = createService();
    const logWarn = vi.fn();
    (service as unknown as { log: { warn: typeof logWarn } }).log = {
      warn: logWarn,
    } as never;

    const result = service.sanitize({
      prompt:
        "A cinematic shot Variation 2 of the city at dusk, fog drifting low.",
    });

    expect(result.lint.ok).toBe(false);
    expect(
      result.lint.errors.some((e: string) =>
        e.toLowerCase().includes("variation artifact"),
      ),
    ).toBe(true);
    expect(logWarn).toHaveBeenCalledTimes(1);
  });

  it("does NOT call warn on a clean prompt", () => {
    const service = createService();
    const logWarn = vi.fn();
    (service as unknown as { log: { warn: typeof logWarn } }).log = {
      warn: logWarn,
    } as never;

    const result = service.sanitize({
      prompt:
        "A cinematic dolly shot of a neon alley at dusk, fog rolling in from the harbor.",
    });

    expect(result.lint.ok).toBe(true);
    expect(result.lint.errors).toEqual([]);
    expect(logWarn).not.toHaveBeenCalled();
  });
});
