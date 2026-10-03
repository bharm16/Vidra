#!/usr/bin/env tsx
import { readFile, writeFile } from "node:fs/promises";
import { assessReviewCoverage, expectedCreativeReviews } from "./review";

const [reviewPath, inventoryPath, reportPath, ...extra] = process.argv.slice(2);
if (!reviewPath || !inventoryPath || !reportPath || extra.length) {
  console.error(
    "Usage: npx tsx scripts/ops/provider-quality/check-review.ts <owner-review.json> <contract-report.json> <coverage-report.json>",
  );
  process.exitCode = 2;
} else {
  try {
    const review: unknown = JSON.parse(await readFile(reviewPath, "utf8"));
    const inventory: unknown = JSON.parse(
      await readFile(inventoryPath, "utf8"),
    );
    const coverage = assessReviewCoverage(
      review,
      expectedCreativeReviews(inventory),
    );
    await writeFile(
      reportPath,
      `${JSON.stringify({ ...coverage, limitation: "Validates recorded review completeness only; does not authenticate the reviewer, inspect artifacts, or verify live execution." }, null, 2)}\n`,
    );
    console.log(JSON.stringify(coverage, null, 2));
    process.exitCode = coverage.status === "recorded-acceptable" ? 0 : 2;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 2;
  }
}
