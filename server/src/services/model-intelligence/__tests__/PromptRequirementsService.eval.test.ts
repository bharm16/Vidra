import { describe, expect, it } from "vitest";
import { PromptRequirementsService } from "../services/PromptRequirementsService";
import {
  REQUIREMENTS_EVAL_CASES,
  type RequirementsEvalCase,
} from "./fixtures/requirementsEvalCases";

/**
 * Deterministic eval for PromptRequirementsService.extractRequirements.
 *
 * extractRequirements is a pure function, so this scores it against the
 * hand-labeled golden set (requirementsEvalCases) with no LLM and no I/O. It
 * exists to gate the planned regex -> taxonomy/span-role rewrite: removing the
 * keyword regex is a behaviour change with no other safety net, and this is the
 * measurement that says whether the rewrite holds quality.
 *
 * The gate is non-regression on the count of correctly-derived flags. The
 * `regexBlindSpot` cases (negation / out-of-vocabulary synonyms) are the
 * improvement target — they are logged on every run so the gap is visible, and
 * a rewrite that closes them raises the count above the baseline.
 */

interface LeafResult {
  path: string;
  expected: unknown;
  actual: unknown;
  ok: boolean;
}

function compareLeaves(
  expected: Record<string, unknown>,
  actual: Record<string, unknown> | undefined,
  prefix: string,
): LeafResult[] {
  const results: LeafResult[] = [];
  for (const [key, expectedValue] of Object.entries(expected)) {
    const path = prefix ? `${prefix}.${key}` : key;
    const actualValue = actual?.[key];
    if (
      expectedValue !== null &&
      typeof expectedValue === "object" &&
      !Array.isArray(expectedValue)
    ) {
      results.push(
        ...compareLeaves(
          expectedValue as Record<string, unknown>,
          actualValue as Record<string, unknown> | undefined,
          path,
        ),
      );
    } else {
      results.push({
        path,
        expected: expectedValue,
        actual: actualValue,
        ok: actualValue === expectedValue,
      });
    }
  }
  return results;
}

function scoreCase(
  service: PromptRequirementsService,
  evalCase: RequirementsEvalCase,
): LeafResult[] {
  const actual = service.extractRequirements(
    evalCase.prompt,
    evalCase.spans,
  ) as unknown as Record<string, unknown>;
  return compareLeaves(
    evalCase.expected as Record<string, unknown>,
    actual,
    "",
  );
}

/**
 * Baseline = the current keyword-regex implementation's score over the fixed
 * golden set. It is intentionally below the total: the regex cannot see
 * negation or out-of-vocabulary synonyms (the regexBlindSpot cases).
 *
 * Contract for the regex -> taxonomy rewrite: keep totalLeaves equal (fixtures
 * unchanged) and correctLeaves at or above the baseline; raise the baseline
 * deliberately when the rewrite legitimately closes blind spots.
 */
const BASELINE_TOTAL_LEAVES = 29;
const BASELINE_CORRECT_LEAVES = 23;

describe("PromptRequirementsService eval (deterministic golden set)", () => {
  const service = new PromptRequirementsService();
  const perCase = REQUIREMENTS_EVAL_CASES.map((c) => ({
    case: c,
    leaves: scoreCase(service, c),
  }));
  const allLeaves = perCase.flatMap((p) => p.leaves);
  const totalLeaves = allLeaves.length;
  const correctLeaves = allLeaves.filter((l) => l.ok).length;

  it("keeps the golden set intact", () => {
    expect(REQUIREMENTS_EVAL_CASES.length).toBeGreaterThanOrEqual(20);
    expect(totalLeaves).toBe(BASELINE_TOTAL_LEAVES);
  });

  it("does not regress flag-derivation accuracy below the baseline", () => {
    const mismatches = perCase.flatMap((p) =>
      p.leaves
        .filter((l) => !l.ok)
        .map(
          (l) =>
            `  ✗ ${p.case.id}${p.case.regexBlindSpot ? " [regexBlindSpot]" : ""} ` +
            `${l.path}: expected ${JSON.stringify(l.expected)}, got ${JSON.stringify(l.actual)}`,
        ),
    );

    // Make the improvement target visible on every run.
    console.log(
      `[requirements-eval] ${correctLeaves}/${totalLeaves} flags correct ` +
        `(${((correctLeaves / totalLeaves) * 100).toFixed(1)}%); ` +
        `${mismatches.length} mismatch(es):\n${mismatches.join("\n") || "  (none)"}`,
    );

    expect(correctLeaves).toBeGreaterThanOrEqual(BASELINE_CORRECT_LEAVES);
  });
});
