import type { FailureKind } from "./deriveWorkspaceStage";

/**
 * The line shown when a stage fails (ADR-0010 / M4 "nothing punishes").
 *
 * One copy per {@link FailureKind}: what failed, the verb to try again, and
 * whether to reassure that nothing was charged (the paid generation stages —
 * picture / motion / clip — vs. the free writing and labeling passes). Rendered
 * from the derived `{stage, failure}` flag, never a parallel error machine.
 */
export interface FailureCopy {
  message: string;
  retryLabel: string;
  notCharged: boolean;
}

const COPY: Record<FailureKind, FailureCopy> = {
  writing: {
    message: "Couldn’t expand that idea.",
    retryLabel: "Try again",
    notCharged: false,
  },
  labeling: {
    message: "Couldn’t highlight the phrases.",
    retryLabel: "Try again",
    notCharged: false,
  },
  picture: {
    message: "The picture didn’t render.",
    retryLabel: "Retry",
    notCharged: true,
  },
  motion: {
    message: "The motion didn’t render.",
    retryLabel: "Try again",
    notCharged: true,
  },
  video: {
    message: "The clip didn’t render.",
    retryLabel: "Try again",
    notCharged: true,
  },
};

export function failureCopy(failure: FailureKind): FailureCopy {
  return COPY[failure];
}
