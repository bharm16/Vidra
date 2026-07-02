/**
 * Idea Box — the empty-canvas entry surface (see CONTEXT.md).
 *
 * Stage machine for the expansion loop's client chain: after optimization
 * lands, the chain generates a first frame and sets it as the start frame,
 * then stops at the gate (render stays an explicit user action).
 */
export type IdeaBoxStage =
  | { kind: "idle" }
  | { kind: "framing" }
  | { kind: "ready" }
  | {
      kind: "failed";
      message: string;
      /**
       * How many frame generations have failed in a row (>= 1). Resets on a
       * successful frame or a stage reset. Lets the failed-state UI escalate
       * its copy when retrying identically is clearly not working.
       */
      consecutiveFailures: number;
    };
