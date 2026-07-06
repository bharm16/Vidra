import type {
  GenerationMediaType,
  GenerationStatus,
} from "@features/generations/types";
import type { WorkspaceArtifacts } from "./deriveWorkspaceStage";

/**
 * The raw workspace signals that determine the derived stage. Kept minimal and
 * decoupled from the full component state so the mapping is unit-testable: the
 * caller resolves `ideaBoxStage?.kind ?? "idle"` and `Boolean(startFrame)`.
 */
export interface WorkspaceArtifactsInput {
  tiles: ReadonlyArray<{
    status: GenerationStatus;
    mediaType: GenerationMediaType;
  }>;
  ideaBoxStageKind: "idle" | "framing" | "ready" | "failed";
  isExpanding: boolean;
  hasExpandedPrompt: boolean;
  hasStartFrame: boolean;
}

const isPending = (status: GenerationStatus): boolean =>
  status === "pending" || status === "generating";

/**
 * Reduce the raw workspace signals to the artifacts that drive the stage. A
 * still picture (hasFrame) is available via an accepted start frame, a
 * ready-to-accept idea-box frame, or any completed image generation; a clip
 * (hasClip) via any completed video. The in-flight run is classified by beat,
 * and a failure is only reported once nothing is in flight (a failure is a run
 * that ended).
 */
export function computeWorkspaceArtifacts(
  input: WorkspaceArtifactsInput,
): WorkspaceArtifacts {
  const { tiles, ideaBoxStageKind } = input;

  const hasDescription = input.hasExpandedPrompt;
  const hasFrame =
    input.hasStartFrame ||
    ideaBoxStageKind === "ready" ||
    tiles.some((t) => t.status === "completed" && t.mediaType === "image");
  const hasClip = tiles.some(
    (t) => t.status === "completed" && t.mediaType === "video",
  );

  let inFlight: WorkspaceArtifacts["inFlight"];
  if (input.isExpanding) {
    inFlight = "writing";
  } else if (
    ideaBoxStageKind === "framing" ||
    tiles.some((t) => isPending(t.status) && t.mediaType === "image")
  ) {
    inFlight = "painting";
  } else if (
    tiles.some((t) => isPending(t.status) && t.mediaType === "video")
  ) {
    inFlight = "moving";
  }

  let failure: WorkspaceArtifacts["failure"];
  if (!inFlight) {
    if (ideaBoxStageKind === "failed") {
      failure = "picture";
    } else {
      const failed = tiles.find((t) => t.status === "failed");
      if (failed) {
        failure =
          failed.mediaType === "video"
            ? "video"
            : failed.mediaType === "image-sequence"
              ? "motion"
              : "picture";
      }
    }
  }

  return {
    hasDescription,
    hasFrame,
    hasClip,
    isKept: false,
    ...(inFlight ? { inFlight } : {}),
    ...(failure ? { failure } : {}),
  };
}
