import {
  applyIntentLockPolicy,
  type IntentLockPhase,
} from "./intentLockPolicy";
import type { PromptLintResult } from "./PromptLintGateService";
import type { CompilationState, PromptQualityReport, ShotPlan } from "../types";

interface IntentLockLike {
  enforceIntentLock(params: {
    originalPrompt: string;
    optimizedPrompt: string;
    shotPlan: ShotPlan | null;
  }): {
    prompt: string;
    passed: boolean;
    repaired: boolean;
    required: { subject: string | null; action: string | null };
  };
  validateIntentPreservation(params: {
    originalPrompt: string;
    optimizedPrompt: string;
    shotPlan: ShotPlan | null;
  }): {
    passed: boolean;
    required: { subject: string | null; action: string | null };
  };
}

interface PromptLintLike {
  sanitize(params: { prompt: string; modelId?: string | null }): {
    prompt: string;
    lint: PromptLintResult;
    repaired: boolean;
  };
}

export interface FinishedPrompt {
  prompt: string;
  /** Verdicts in their final shape — no caller re-maps them. */
  quality: PromptQualityReport;
  /** Input compilation state with the phase's intent verdict attached. */
  compilation: CompilationState | null;
}

/**
 * The last two things that happen to every prompt before it leaves this service:
 * the intent lock for the current phase, then the lint sanitizer.
 *
 * One module because there are two callers — `/api/optimize` and
 * `/api/optimize-compile` — that must give the same guarantees. They previously
 * open-coded the same three steps and had already drifted: the compile path
 * derived its intent phase differently and never recorded that it had linted.
 */
export function finishPrompt(params: {
  prompt: string;
  originalPrompt: string;
  shotPlan: ShotPlan | null;
  phase: IntentLockPhase;
  modelId?: string | null;
  intentLock: IntentLockLike;
  promptLint: PromptLintLike;
  compilation?: CompilationState | null;
}): FinishedPrompt {
  const intent = applyIntentLockPolicy({
    intentLock: params.intentLock,
    originalPrompt: params.originalPrompt,
    optimizedPrompt: params.prompt,
    shotPlan: params.shotPlan,
    phase: params.phase,
  });

  const linted = params.promptLint.sanitize({
    prompt: intent.prompt,
    modelId: params.modelId ?? null,
  });

  return {
    prompt: linted.prompt,
    quality: {
      intentLock: intent.intentLock,
      lint: {
        ok: linted.lint.ok,
        errors: linted.lint.errors,
        warnings: linted.lint.warnings,
        wordCount: linted.lint.wordCount,
        repaired: linted.repaired,
        ...(linted.lint.overBudget
          ? { overBudget: linted.lint.overBudget }
          : {}),
      },
    },
    compilation: params.compilation
      ? { ...params.compilation, intentLock: intent.intentLock }
      : null,
  };
}
