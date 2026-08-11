import type {
  VideoPromptLintFinding,
  VideoPromptLintSeverity,
} from "@services/prompt-optimization/strategies/videoPromptLinter";

export interface SlotRepairDecision {
  shouldRepair: boolean;
  /** Reroll budget when repairing; 0 when the slots ship as-is. */
  rerollAttempts: number;
  critical: VideoPromptLintFinding[];
  quality: VideoPromptLintFinding[];
  minor: VideoPromptLintFinding[];
}

const bySeverity = (
  findings: VideoPromptLintFinding[],
  severity: VideoPromptLintSeverity,
): VideoPromptLintFinding[] =>
  findings.filter((finding) => finding.severity === severity);

/**
 * Whether lint findings are worth spending another LLM call on, and how many
 * reroll seeds to try before falling back to a targeted repair.
 *
 * Pure and synchronous on purpose: the escalation rules are the interesting part
 * of the strategy's lint ladder, and they used to be testable only by driving a
 * live provider. Severity comes from the finding, never from its wording.
 */
export function decideSlotRepair(params: {
  findings: VideoPromptLintFinding[];
  completenessScore: number;
  minAcceptableScore: number;
}): SlotRepairDecision {
  const critical = bySeverity(params.findings, "critical");
  const quality = bySeverity(params.findings, "quality");
  const minor = bySeverity(params.findings, "minor");

  // A sparse slot set earns a reroll off a single cosmetic finding; a complete
  // one has to accumulate two before it is worth another call.
  const escalateMinor =
    minor.length >= 2 || params.completenessScore < params.minAcceptableScore;
  const shouldRepair =
    critical.length > 0 || quality.length > 0 || escalateMinor;

  const rerollAttempts = !shouldRepair
    ? 0
    : critical.length > 0 || quality.length > 0
      ? 3
      : 1;

  return { shouldRepair, rerollAttempts, critical, quality, minor };
}
