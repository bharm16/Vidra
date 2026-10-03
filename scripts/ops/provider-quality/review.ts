import { z } from "zod";
import tasks from "./creative-tasks.json";

const TaskIds = new Set(tasks.tasks.map((task) => task.id));

/** Schema for a human record, never produced by the offline harness. */
export const CreativeReviewSchema = z
  .object({
    schema: z.literal("vidra-creative-review/v1"),
    taskSet: z.literal("creative-tasks/v1"),
    ownerApproval: z.object({
      reviewer: z.string().trim().min(1),
      reviewedAt: z.iso.datetime(),
      notes: z.string().trim().min(1),
    }),
    results: z
      .array(
        z.object({
          taskId: z
            .string()
            .refine((id) => TaskIds.has(id), "Unknown creative task"),
          pathId: z.string().trim().min(1),
          model: z.string().trim().min(1),
          revision: z.string().regex(/^[a-f0-9]{40}$/),
          configuration: z.record(z.string(), z.unknown()),
          submittedRequestEvidence: z.string().trim().min(1),
          outputEvidence: z
            .array(
              z.object({
                path: z.string().trim().min(1),
                sha256: z.string().regex(/^[a-f0-9]{64}$/),
              }),
            )
            .min(1),
          sourceEvidence: z.array(
            z.object({
              path: z.string().trim().min(1),
              sha256: z.string().regex(/^[a-f0-9]{64}$/),
            }),
          ),
          reviewer: z.string().trim().min(1),
          reviewedAt: z.iso.datetime(),
          verdict: z.enum(["acceptable", "unacceptable", "inconclusive"]),
          observations: z.string().trim().min(1),
        }),
      )
      .min(1),
  })
  .superRefine((review, context) => {
    const seen = new Set<string>();
    for (const [index, result] of review.results.entries()) {
      const key = `${result.taskId}/${result.pathId}`;
      if (seen.has(key))
        context.addIssue({
          code: "custom",
          path: ["results", index],
          message: "Duplicate task/path review",
        });
      seen.add(key);
      if (
        result.taskId !== "cup-and-book" &&
        result.taskId !== "pin-negotiation" &&
        result.sourceEvidence.length === 0
      )
        context.addIssue({
          code: "custom",
          path: ["results", index, "sourceEvidence"],
          message: "This task requires source evidence",
        });
    }
  });

export type CreativeReview = z.infer<typeof CreativeReviewSchema>;

export interface ReviewCoverage {
  status: "recorded-acceptable" | "incomplete-or-unacceptable";
  missing: string[];
  unacceptable: string[];
}

/** Completeness only: this cannot authenticate an owner or inspect image quality. */
export function assessReviewCoverage(
  input: unknown,
  expected: readonly { taskId: string; pathId: string }[],
): ReviewCoverage {
  if (expected.length === 0)
    throw new Error(
      "Creative review needs a non-empty expected task/path matrix",
    );
  const review = CreativeReviewSchema.parse(input);
  const recorded = new Set(
    review.results.map((result) => `${result.taskId}/${result.pathId}`),
  );
  const missing = expected
    .map((entry) => `${entry.taskId}/${entry.pathId}`)
    .filter((key) => !recorded.has(key));
  const unacceptable = review.results
    .filter((result) => result.verdict !== "acceptable")
    .map((result) => `${result.taskId}/${result.pathId}`);
  return {
    status:
      missing.length === 0 && unacceptable.length === 0
        ? "recorded-acceptable"
        : "incomplete-or-unacceptable",
    missing,
    unacceptable,
  };
}

export const ContractReviewInventorySchema = z.object({
  schema: z.literal("vidra-provider-quality/v1"),
  paths: z
    .array(
      z.object({
        id: z.string().min(1),
        contract: z.enum(["passed", "failed", "not-run"]),
        operation: z.enum([
          "generate",
          "edit",
          "transform",
          "sketch",
          "motion",
        ]),
      }),
    )
    .min(1),
});

/** Bind creative review to the current callable inventory, including failing paths. */
export function expectedCreativeReviews(
  input: unknown,
): { taskId: string; pathId: string }[] {
  const report = ContractReviewInventorySchema.parse(input);
  return report.paths
    .filter(
      (path) =>
        path.contract !== "not-run" && !path.id.includes("invalid-ratio"),
    )
    .map((path) => ({
      pathId: path.id,
      taskId: path.id.includes("incapable-pin")
        ? "pin-negotiation"
        : path.operation === "generate"
          ? "cup-and-book"
          : path.operation === "edit"
            ? "recolor-preservation"
            : path.operation === "motion"
              ? "motion-pair"
              : path.operation === "sketch"
                ? "sketch-fidelity"
                : path.id.endsWith("vectorize")
                  ? "vector-preservation"
                  : "background-removal",
    }));
}
