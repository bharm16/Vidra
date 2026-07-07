import { describe, it, expect } from "vitest";
import {
  computeWorkspaceArtifacts,
  type WorkspaceArtifactsInput,
} from "../computeWorkspaceArtifacts";

const base: WorkspaceArtifactsInput = {
  tiles: [],
  ideaBoxStageKind: "idle",
  isExpanding: false,
  hasExpandedPrompt: false,
  hasStartFrame: false,
};

describe("computeWorkspaceArtifacts", () => {
  it("is all-false for an empty workspace", () => {
    expect(computeWorkspaceArtifacts(base)).toEqual({
      hasDescription: false,
      hasFrame: false,
      hasClip: false,
      isKept: false,
    });
  });

  it("maps an expanded prompt to hasDescription", () => {
    expect(
      computeWorkspaceArtifacts({ ...base, hasExpandedPrompt: true })
        .hasDescription,
    ).toBe(true);
  });

  it("treats a start frame, a ready idea-box frame, or a completed image as hasFrame", () => {
    expect(
      computeWorkspaceArtifacts({ ...base, hasStartFrame: true }).hasFrame,
    ).toBe(true);
    expect(
      computeWorkspaceArtifacts({ ...base, ideaBoxStageKind: "ready" })
        .hasFrame,
    ).toBe(true);
    expect(
      computeWorkspaceArtifacts({
        ...base,
        tiles: [{ status: "completed", mediaType: "image" }],
      }).hasFrame,
    ).toBe(true);
  });

  it("treats a completed video as hasClip", () => {
    expect(
      computeWorkspaceArtifacts({
        ...base,
        tiles: [{ status: "completed", mediaType: "video" }],
      }).hasClip,
    ).toBe(true);
  });

  it("classifies the in-flight run: expanding→writing, framing/pending-image→painting, pending-video→moving", () => {
    expect(
      computeWorkspaceArtifacts({ ...base, isExpanding: true }).inFlight,
    ).toBe("writing");
    expect(
      computeWorkspaceArtifacts({ ...base, ideaBoxStageKind: "framing" })
        .inFlight,
    ).toBe("painting");
    expect(
      computeWorkspaceArtifacts({
        ...base,
        tiles: [{ status: "generating", mediaType: "image" }],
      }).inFlight,
    ).toBe("painting");
    expect(
      computeWorkspaceArtifacts({
        ...base,
        tiles: [{ status: "pending", mediaType: "video" }],
      }).inFlight,
    ).toBe("moving");
  });

  it("maps a failure (when nothing is in flight) to its beat", () => {
    expect(
      computeWorkspaceArtifacts({
        ...base,
        hasExpandedPrompt: true,
        ideaBoxStageKind: "failed",
      }).failure,
    ).toBe("picture");
    expect(
      computeWorkspaceArtifacts({
        ...base,
        tiles: [{ status: "failed", mediaType: "video" }],
      }).failure,
    ).toBe("video");
  });

  it("maps a failed expansion to a writing failure, but only once nothing is in flight", () => {
    expect(
      computeWorkspaceArtifacts({ ...base, writingFailed: true }).failure,
    ).toBe("writing");
    // A running expansion is not a failure yet — in-flight wins.
    expect(
      computeWorkspaceArtifacts({
        ...base,
        writingFailed: true,
        isExpanding: true,
      }).failure,
    ).toBeUndefined();
  });
});
