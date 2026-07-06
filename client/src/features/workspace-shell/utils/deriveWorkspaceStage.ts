/**
 * The single workspace stage (S0–S6), derived from persisted artifacts.
 *
 * A stage is "where the work is," not "what the UI is doing right now" — it is
 * derived purely from artifacts (description / frame / clip / in-flight run) and
 * stays orthogonal to ephemeral UI (focus, Tune drawer, zoom). This is the
 * ADR-0011 D2 contract: the stage is reconstructed from artifacts on restore and
 * is never persisted. Failure is a flag layered on the stage, never a separate
 * stage (ADR-0010 / M2a scope).
 */

export type WorkspaceStage =
  | "empty"
  | "writing"
  | "painting"
  | "picture"
  | "moving"
  | "clip"
  | "kept";

export type FailureKind =
  | "writing"
  | "labeling"
  | "picture"
  | "motion"
  | "video";

/** The in-flight run's kind, when a generation is currently running. */
export type InFlightKind = "writing" | "painting" | "moving";

export interface WorkspaceArtifacts {
  /** An expansion has produced (or the creator has edited) a description. */
  hasDescription: boolean;
  /** A ready still (the start frame) exists. */
  hasFrame: boolean;
  /** A ready clip (completed video) exists. */
  hasClip: boolean;
  /** The current clip has been kept. */
  isKept: boolean;
  /** A generation is in flight, and which kind. */
  inFlight?: InFlightKind;
  /** The most recent run failed, and at which stage. */
  failure?: FailureKind;
}

export interface WorkspaceStageResult {
  stage: WorkspaceStage;
  failure?: FailureKind;
}

/** The beat a failure belongs to — a failure pins the stage to where it happened. */
function stageForFailure(failure: FailureKind): WorkspaceStage {
  switch (failure) {
    case "writing":
      return "writing";
    case "labeling":
      return "painting";
    case "picture":
      return "picture";
    case "motion":
    case "video":
      return "moving";
  }
}

export function deriveWorkspaceStage(
  artifacts: WorkspaceArtifacts,
): WorkspaceStageResult {
  if (artifacts.failure) {
    return {
      stage: stageForFailure(artifacts.failure),
      failure: artifacts.failure,
    };
  }
  if (artifacts.inFlight === "writing") return { stage: "writing" };
  if (artifacts.inFlight === "painting") return { stage: "painting" };
  if (artifacts.inFlight === "moving") return { stage: "moving" };
  if (artifacts.isKept) return { stage: "kept" };
  if (artifacts.hasClip) return { stage: "clip" };
  if (artifacts.hasFrame) return { stage: "picture" };
  // A description with no frame yet is post-writing, awaiting the picture — the
  // 'painting' beat, not 'empty'. (Restored expanded-prompt sessions land here.)
  if (artifacts.hasDescription) return { stage: "painting" };
  return { stage: "empty" };
}
