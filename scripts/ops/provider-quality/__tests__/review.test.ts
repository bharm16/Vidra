import { describe, expect, it } from "vitest";
import {
  assessReviewCoverage,
  CreativeReviewSchema,
  expectedCreativeReviews,
} from "../review";
import pending from "../owner-review.pending.json";

const result = {
  taskId: "recolor-preservation",
  pathId: "studio/edit/nano-banana-2",
  model: "google/nano-banana-2",
  revision: "a".repeat(40),
  configuration: { resolution: "1K" },
  submittedRequestEvidence: "owner-local/request.json",
  sourceEvidence: [{ path: "owner-local/source.png", sha256: "b".repeat(64) }],
  outputEvidence: [{ path: "owner-local/edit.png", sha256: "c".repeat(64) }],
  reviewer: "test owner",
  reviewedAt: "2026-10-03T16:00:00Z",
  verdict: "acceptable",
  observations: "Cup green; book, table, pose and framing retained.",
};
const review = {
  schema: "vidra-creative-review/v1",
  taskSet: "creative-tasks/v1",
  ownerApproval: {
    reviewer: "test owner",
    reviewedAt: "2026-10-03T16:00:00Z",
    notes: "Approved the task set for bounded evaluation.",
  },
  results: [result],
};

describe("creative review evidence completeness", () => {
  it("cannot treat the prepared pending template as owner-reviewed evidence", () => {
    expect(CreativeReviewSchema.safeParse(pending).success).toBe(false);
  });
  it("names missing task/path results and preserves unacceptable judgments", () => {
    const expected = [
      { taskId: result.taskId, pathId: result.pathId },
      { taskId: "motion-pair", pathId: "video/wan" },
    ];
    expect(assessReviewCoverage(review, expected)).toMatchObject({
      status: "incomplete-or-unacceptable",
      missing: ["motion-pair/video/wan"],
    });
    expect(
      assessReviewCoverage(
        { ...review, results: [{ ...result, verdict: "unacceptable" }] },
        expected,
      ),
    ).toMatchObject({
      unacceptable: ["recolor-preservation/studio/edit/nano-banana-2"],
    });
  });
  it("rejects duplicate evidence, unknown tasks, missing source hashes and empty expected matrices", () => {
    expect(
      CreativeReviewSchema.safeParse({ ...review, results: [result, result] })
        .success,
    ).toBe(false);
    expect(
      CreativeReviewSchema.safeParse({
        ...review,
        results: [{ ...result, taskId: "invented" }],
      }).success,
    ).toBe(false);
    expect(
      CreativeReviewSchema.safeParse({
        ...review,
        results: [{ ...result, sourceEvidence: [] }],
      }).success,
    ).toBe(false);
    expect(() => assessReviewCoverage(review, [])).toThrow("non-empty");
  });
  it("includes failing models in the creative matrix and excludes invalid aspect-ratio contract probes", () => {
    expect(
      expectedCreativeReviews({
        schema: "vidra-provider-quality/v1",
        paths: [
          { id: "video/luma-ray3/i2v/16:9", operation: "motion" },
          {
            id: "studio/generate/nano-banana-2/invalid-ratio",
            operation: "generate",
          },
          { id: "studio/routing/incapable-pin-negotiate", operation: "edit" },
        ],
      }),
    ).toEqual([
      { taskId: "motion-pair", pathId: "video/luma-ray3/i2v/16:9" },
      {
        taskId: "pin-negotiation",
        pathId: "studio/routing/incapable-pin-negotiate",
      },
    ]);
  });
});
