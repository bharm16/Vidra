import { describe, expect, it, vi } from "vitest";

import { finishPrompt } from "../finishPrompt";
import type { CompilationState } from "../../types";

const compilation: CompilationState = {
  status: "compiled",
  usedFallback: false,
  sourceKind: "artifact",
  structuredArtifactReused: true,
  analyzerBypassed: true,
  compiledFor: "wan-2.2",
};

const intentLock = (overrides?: {
  enforced?: { prompt: string; passed: boolean; repaired: boolean };
  validated?: { passed: boolean };
}) => ({
  enforceIntentLock: vi.fn(({ optimizedPrompt }) => ({
    prompt: overrides?.enforced?.prompt ?? optimizedPrompt,
    passed: overrides?.enforced?.passed ?? true,
    repaired: overrides?.enforced?.repaired ?? false,
    required: { subject: "baby", action: "driving" },
  })),
  validateIntentPreservation: vi.fn(() => ({
    passed: overrides?.validated?.passed ?? true,
    required: { subject: "baby", action: "driving" },
  })),
});

const promptLint = (result?: { prompt?: string; ok?: boolean }) => ({
  sanitize: vi.fn(({ prompt }) => ({
    prompt: result?.prompt ?? prompt,
    lint: {
      ok: result?.ok ?? true,
      errors: result?.ok === false ? ["Contains markdown heading syntax."] : [],
      warnings: [],
      wordCount: prompt.split(/\s+/).length,
    },
    repaired: result?.prompt !== undefined,
  })),
});

describe("finishPrompt", () => {
  it("applies the intent lock before the lint pass", () => {
    const lock = intentLock({
      enforced: { prompt: "repaired prompt", passed: true, repaired: true },
    });
    const lint = promptLint();

    const finished = finishPrompt({
      prompt: "drifted prompt",
      originalPrompt: "baby driving a car",
      shotPlan: null,
      phase: "generic",
      intentLock: lock,
      promptLint: lint,
    });

    expect(lint.sanitize).toHaveBeenCalledWith({
      prompt: "repaired prompt",
      modelId: null,
    });
    expect(finished.prompt).toBe("repaired prompt");
    expect(finished.quality.intentLock.repaired).toBe(true);
  });

  it("passes the model id to the lint pass so word budgets apply", () => {
    const lint = promptLint();

    finishPrompt({
      prompt: "compiled prompt",
      originalPrompt: "baby driving a car",
      shotPlan: null,
      phase: "post-compile",
      modelId: "wan-2.2",
      intentLock: intentLock(),
      promptLint: lint,
    });

    expect(lint.sanitize).toHaveBeenCalledWith({
      prompt: "compiled prompt",
      modelId: "wan-2.2",
    });
  });

  it("attaches the intent verdict to the compilation state it was given", () => {
    const finished = finishPrompt({
      prompt: "compiled prompt",
      originalPrompt: "baby driving a car",
      shotPlan: null,
      phase: "post-compile",
      modelId: "wan-2.2",
      intentLock: intentLock({ validated: { passed: false } }),
      promptLint: promptLint(),
      compilation,
    });

    expect(finished.compilation).toMatchObject({
      status: "compiled",
      compiledFor: "wan-2.2",
      intentLock: { passed: false, skippedRepair: true },
    });
  });

  it("returns no compilation state when none was supplied", () => {
    const finished = finishPrompt({
      prompt: "generic prompt",
      originalPrompt: "baby driving a car",
      shotPlan: null,
      phase: "generic",
      intentLock: intentLock(),
      promptLint: promptLint(),
    });

    expect(finished.compilation).toBeNull();
  });

  it("reports a failed lint without withholding the prompt", () => {
    const finished = finishPrompt({
      prompt: "# Heading\nprompt body",
      originalPrompt: "baby driving a car",
      shotPlan: null,
      phase: "generic",
      intentLock: intentLock(),
      promptLint: promptLint({ prompt: "prompt body", ok: false }),
    });

    expect(finished.prompt).toBe("prompt body");
    expect(finished.quality.lint.ok).toBe(false);
    expect(finished.quality.lint.repaired).toBe(true);
  });
});
