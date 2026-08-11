import { describe, expect, it } from "vitest";

import { decideSlotRepair } from "../decideSlotRepair";
import type { VideoPromptLintFinding } from "@services/prompt-optimization/strategies/videoPromptLinter";

const finding = (
  severity: VideoPromptLintFinding["severity"],
  code = "action_too_long",
): VideoPromptLintFinding =>
  ({
    code,
    severity,
    message: `synthetic ${severity} message`,
  }) as VideoPromptLintFinding;

/**
 * The repair decision is a pure function of severities and completeness — it
 * must never depend on message wording. Every case below uses synthetic
 * messages that match none of the linter's real prose.
 */
describe("decideSlotRepair", () => {
  const minAcceptableScore = 0.5;

  it("does not repair clean slots", () => {
    const decision = decideSlotRepair({
      findings: [],
      completenessScore: 1,
      minAcceptableScore,
    });

    expect(decision.shouldRepair).toBe(false);
    expect(decision.rerollAttempts).toBe(0);
  });

  it("repairs with three reroll attempts on a critical finding", () => {
    const decision = decideSlotRepair({
      findings: [finding("critical")],
      completenessScore: 1,
      minAcceptableScore,
    });

    expect(decision.shouldRepair).toBe(true);
    expect(decision.rerollAttempts).toBe(3);
  });

  it("repairs with three reroll attempts on a quality finding", () => {
    const decision = decideSlotRepair({
      findings: [finding("quality")],
      completenessScore: 1,
      minAcceptableScore,
    });

    expect(decision.shouldRepair).toBe(true);
    expect(decision.rerollAttempts).toBe(3);
  });

  it("ships a single minor finding on a complete slot set", () => {
    const decision = decideSlotRepair({
      findings: [finding("minor")],
      completenessScore: 1,
      minAcceptableScore,
    });

    expect(decision.shouldRepair).toBe(false);
  });

  it("escalates two minor findings to a single reroll attempt", () => {
    const decision = decideSlotRepair({
      findings: [finding("minor", "action_too_long"), finding("minor")],
      completenessScore: 1,
      minAcceptableScore,
    });

    expect(decision.shouldRepair).toBe(true);
    expect(decision.rerollAttempts).toBe(1);
  });

  it("escalates a single minor finding when the slot set is sparse", () => {
    const decision = decideSlotRepair({
      findings: [finding("minor")],
      completenessScore: 0.33,
      minAcceptableScore,
    });

    expect(decision.shouldRepair).toBe(true);
    expect(decision.rerollAttempts).toBe(1);
  });

  it("groups findings by severity for logging", () => {
    const decision = decideSlotRepair({
      findings: [finding("critical"), finding("quality"), finding("minor")],
      completenessScore: 1,
      minAcceptableScore,
    });

    expect(decision.critical).toHaveLength(1);
    expect(decision.quality).toHaveLength(1);
    expect(decision.minor).toHaveLength(1);
  });
});
