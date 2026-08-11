import type { CompilationIntentLockState, ShotPlan } from "../types";

/**
 * Where in the pipeline the lock is being applied. This is the whole policy:
 *
 * - `generic` — the prompt is still ours to rewrite, so a failed lock is
 *   repaired in place.
 * - `post-compile` — the prompt now carries model-specific structure (shot
 *   markers, audio lines, character handles) that a repair would flatten, so the
 *   lock validates and reports without mutating.
 *
 * Passing the phase explicitly replaced inferring it from
 * `compilation.status === "compiled"`, which two callers derived differently.
 */
export type IntentLockPhase = "generic" | "post-compile";

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

const SKIPPED_REPAIR_WARNING =
  "Intent lock requested a repair, but repair was skipped to preserve model-specific output structure.";

export interface IntentLockPolicyResult {
  prompt: string;
  /** Verdict for the response's compilation state and for telemetry. */
  intentLock: CompilationIntentLockState;
}

export function applyIntentLockPolicy(params: {
  intentLock: IntentLockLike;
  originalPrompt: string;
  optimizedPrompt: string;
  shotPlan: ShotPlan | null;
  phase: IntentLockPhase;
}): IntentLockPolicyResult {
  const prompt = params.optimizedPrompt.trim();
  const request = {
    originalPrompt: params.originalPrompt,
    optimizedPrompt: params.optimizedPrompt,
    shotPlan: params.shotPlan,
  };

  try {
    if (params.phase === "post-compile") {
      const verdict = params.intentLock.validateIntentPreservation(request);
      return {
        prompt,
        intentLock: {
          passed: verdict.passed,
          repaired: false,
          skippedRepair: !verdict.passed,
          required: verdict.required,
          ...(verdict.passed ? {} : { warning: SKIPPED_REPAIR_WARNING }),
        },
      };
    }

    const result = params.intentLock.enforceIntentLock(request);
    return {
      prompt: result.prompt,
      intentLock: {
        passed: result.passed,
        repaired: result.repaired,
        skippedRepair: false,
        required: result.required,
      },
    };
  } catch (error) {
    // The lock is a quality gate, not a delivery gate: a collaborator that
    // throws must not cost the caller a prompt it already paid for.
    return {
      prompt,
      intentLock: {
        passed: false,
        repaired: false,
        skippedRepair: true,
        warning: error instanceof Error ? error.message : String(error),
        required: { subject: null, action: null },
      },
    };
  }
}
