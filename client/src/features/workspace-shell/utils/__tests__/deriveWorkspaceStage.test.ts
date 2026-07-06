import { describe, it, expect } from "vitest";
import {
  deriveWorkspaceStage,
  type WorkspaceArtifacts,
} from "../deriveWorkspaceStage";

const noArtifacts: WorkspaceArtifacts = {
  hasDescription: false,
  hasFrame: false,
  hasClip: false,
  isKept: false,
};

describe("deriveWorkspaceStage", () => {
  it("is 'empty' when no work exists and nothing is in flight", () => {
    expect(deriveWorkspaceStage(noArtifacts)).toEqual({ stage: "empty" });
  });

  it("is 'writing' while the expansion run is in flight", () => {
    expect(
      deriveWorkspaceStage({ ...noArtifacts, inFlight: "writing" }),
    ).toEqual({ stage: "writing" });
  });

  // The happy-path spine: an in-flight run wins; otherwise the furthest-completed
  // artifact decides, most-advanced first (kept > clip > picture).
  const spine: Array<[Partial<WorkspaceArtifacts>, string]> = [
    [{ inFlight: "painting" }, "painting"],
    [{ inFlight: "moving" }, "moving"],
    [{ hasFrame: true }, "picture"],
    [{ hasFrame: true, hasClip: true }, "clip"],
    [{ hasFrame: true, hasClip: true, isKept: true }, "kept"],
  ];

  it.each(spine)("derives the spine: %o → %s", (partial, expected) => {
    expect(deriveWorkspaceStage({ ...noArtifacts, ...partial }).stage).toBe(
      expected,
    );
  });

  // Failure is a flag layered on the stage, pinned to the beat where the run
  // failed — never a separate stage (ADR-0010 / M2a).
  const failures: Array<[Partial<WorkspaceArtifacts>, string, string]> = [
    [{ failure: "writing" }, "writing", "writing"],
    [{ hasDescription: true, failure: "labeling" }, "painting", "labeling"],
    [{ hasDescription: true, failure: "picture" }, "picture", "picture"],
    [{ hasFrame: true, failure: "motion" }, "moving", "motion"],
    [{ hasFrame: true, failure: "video" }, "moving", "video"],
  ];

  it.each(failures)(
    "pins a failure to its beat: %o → %s",
    (partial, stage, failure) => {
      expect(deriveWorkspaceStage({ ...noArtifacts, ...partial })).toEqual({
        stage,
        failure,
      });
    },
  );

  // Restore is free because the stage is derived from artifacts (D2): a reloaded
  // session has no in-flight run, yet reconstructs to the right beat from what
  // was persisted.
  it("reconstructs the stage on restore: a frame with no in-flight run → 'picture'", () => {
    expect(
      deriveWorkspaceStage({
        ...noArtifacts,
        hasDescription: true,
        hasFrame: true,
      }),
    ).toEqual({ stage: "picture" });
  });

  // A description with no frame and nothing in flight is post-writing, awaiting
  // the picture — the 'painting' beat, NOT 'empty'. (The workspace oracle: a
  // restored expanded-prompt session shows the FrameStage, never the hero.)
  it("a description with no frame and nothing in flight → 'painting'", () => {
    expect(
      deriveWorkspaceStage({ ...noArtifacts, hasDescription: true }),
    ).toEqual({ stage: "painting" });
  });
});
