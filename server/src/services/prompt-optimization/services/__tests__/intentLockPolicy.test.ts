import { describe, expect, it, vi } from "vitest";

import { applyIntentLockPolicy } from "../intentLockPolicy";

const compiledPrompt =
  "Shot 1: A cyclist pushes off into the frame. Shot 2: The camera tracks behind as rain sprays from the tires.";

const required = { subject: "cyclist", action: "pushes off" };

describe("applyIntentLockPolicy", () => {
  it("repairs in place during the generic phase", () => {
    const repaired = "A cyclist pushes off into the frame. Rain sprays.";
    const intentLock = {
      enforceIntentLock: vi.fn(() => ({
        prompt: repaired,
        passed: true,
        repaired: true,
        required,
      })),
      validateIntentPreservation: vi.fn(),
    };

    const result = applyIntentLockPolicy({
      intentLock,
      originalPrompt: "A cyclist pushes off into the frame",
      optimizedPrompt: "A rider rolls away.",
      shotPlan: null,
      phase: "generic",
    });

    expect(result.prompt).toBe(repaired);
    expect(result.intentLock).toMatchObject({ passed: true, repaired: true });
    expect(intentLock.validateIntentPreservation).not.toHaveBeenCalled();
  });

  it("reports a failed generic lock without discarding the prompt", () => {
    const candidate = "A rider rolls away.";
    const intentLock = {
      enforceIntentLock: vi.fn(() => ({
        prompt: candidate,
        passed: false,
        repaired: false,
        required,
      })),
      validateIntentPreservation: vi.fn(),
    };

    const result = applyIntentLockPolicy({
      intentLock,
      originalPrompt: "A cyclist pushes off into the frame",
      optimizedPrompt: candidate,
      shotPlan: null,
      phase: "generic",
    });

    expect(result.prompt).toBe(candidate);
    expect(result.intentLock.passed).toBe(false);
  });

  it("preserves model-compiled prompt structure when the lock fails post-compile", () => {
    const intentLock = {
      enforceIntentLock: vi.fn(),
      validateIntentPreservation: vi.fn(() => ({ passed: false, required })),
    };

    const result = applyIntentLockPolicy({
      intentLock,
      originalPrompt: "A cyclist pushes off into the frame",
      optimizedPrompt: compiledPrompt,
      shotPlan: null,
      phase: "post-compile",
    });

    expect(result.prompt).toBe(compiledPrompt);
    expect(result.intentLock).toMatchObject({
      passed: false,
      repaired: false,
      skippedRepair: true,
      required,
    });
    // Post-compile never pays for a repair it intends to throw away.
    expect(intentLock.enforceIntentLock).not.toHaveBeenCalled();
  });

  it("passes a compiled prompt through cleanly when the lock holds", () => {
    const intentLock = {
      enforceIntentLock: vi.fn(),
      validateIntentPreservation: vi.fn(() => ({ passed: true, required })),
    };

    const result = applyIntentLockPolicy({
      intentLock,
      originalPrompt: "A cyclist pushes off into the frame",
      optimizedPrompt: compiledPrompt,
      shotPlan: null,
      phase: "post-compile",
    });

    expect(result.prompt).toBe(compiledPrompt);
    expect(result.intentLock).toMatchObject({
      passed: true,
      skippedRepair: false,
    });
    expect(result.intentLock.warning).toBeUndefined();
  });

  it("preserves the prompt when the lock throws", () => {
    const intentLock = {
      enforceIntentLock: vi.fn(),
      validateIntentPreservation: vi.fn(() => {
        throw new Error("Intent lock failed: tokenizer blew up");
      }),
    };

    const result = applyIntentLockPolicy({
      intentLock,
      originalPrompt: "Character A walks into frame under a metal roof",
      optimizedPrompt: compiledPrompt,
      shotPlan: null,
      phase: "post-compile",
    });

    expect(result.prompt).toBe(compiledPrompt);
    expect(result.intentLock.passed).toBe(false);
    expect(result.intentLock.warning).toContain("Intent lock failed");
    expect(result.intentLock.skippedRepair).toBe(true);
  });
});
