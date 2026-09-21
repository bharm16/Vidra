/**
 * The smoke's orchestrator (issue #140): preflight → derive ceiling → walk
 * the steps, charging every reserved leg against the ceiling BEFORE the step
 * runs → validate outputs → report.
 *
 * Enforcement rules, straight from the issue:
 *
 *   - "the run aborts on the first call that would exceed it": the check is
 *     pre-dispatch. A step whose reservation would cross either the dollar
 *     ceiling or the request ceiling never executes; the remaining steps are
 *     reported as not-run; the verdict is failed (red), never a trimmed
 *     pass.
 *   - "Missing credentials or unknown cost bounds produce an explicit
 *     non-verification result": when the preflight is missing anything, or
 *     the ceiling derivation has any unknown bound, no step runs at all and
 *     the verdict is not-verified — with the exact absent credentials and
 *     unknown bounds named.
 *   - Spend that was never declared (a step emitting a call for a leg it did
 *     not reserve) fails the run: off-book spend is how a ceiling stops
 *     meaning anything.
 *
 * Pure orchestration: the steps are injected, so unit tests drive this with
 * fakes at the provider seam and the script (smoke.ts) wires the real app.
 */

import type { DerivedSmokeCeiling, SmokeCeilingDerivation } from "./ceiling";
import type {
  SmokeCallRecord,
  SmokeLegId,
  SmokeReport,
  SmokeStep,
  SmokeStepExecution,
  SmokeStepOutcome,
  SmokeVerdict,
} from "./types";

/** Float slop for the dollar comparison; a tenth of a millicent. */
const USD_EPSILON = 1e-7;

export interface SmokeRunnerOptions {
  preflight: PreflightInput;
  ceiling: SmokeCeilingDerivation;
  steps: readonly SmokeStep[];
  /**
   * Optionally LOWER the derived dollar ceiling (a drill: the acceptance
   * criterion's "abort on the first call that would exceed it, tested with a
   * lowered ceiling"). An override at or above the derived ceiling is
   * ignored — the ceiling stays derived-by-default; the report says which is
   * in force.
   */
  enforcedCeilingUsd?: number;
  now?: () => number;
}

/** Minimal preflight slice the runner consumes (keeps it decoupled). */
export interface PreflightInput {
  missing: readonly { credential: string; legs: readonly SmokeLegId[] }[];
}

/** One leg's reservation recorded before a step dispatches. */
interface LegReservation {
  leg: SmokeLegId;
  unitCostUsd: number;
}

export async function runSmoke(
  options: SmokeRunnerOptions,
): Promise<SmokeReport> {
  const now = options.now ?? Date.now;
  const startedAtMs = now();
  const steps: SmokeStepOutcome[] = [];
  const calls: SmokeCallRecord[] = [];

  // ── Non-verification: credentials or bounds missing — nothing runs. ──
  const ceilingDerivation = options.ceiling;
  if (!ceilingDerivation.ok || options.preflight.missing.length > 0) {
    const unknownBounds = ceilingDerivation.ok
      ? []
      : [...ceilingDerivation.unknownBounds];
    for (const step of options.steps) {
      steps.push(notRun(step, "run did not verify: credentials or cost bounds missing"));
    }
    return assemble({
      verdict: {
        kind: "not-verified",
        missingCredentials: [...options.preflight.missing],
        unknownBounds,
      },
      ceiling: null,
      ceilingOverride: null,
      steps,
      calls,
      startedAtMs,
      finishedAtMs: now(),
    });
  }
  const derived: DerivedSmokeCeiling = ceilingDerivation.ceiling;

  const enforcedUsd =
    options.enforcedCeilingUsd !== undefined &&
    options.enforcedCeilingUsd < derived.ceilingUsd
      ? options.enforcedCeilingUsd
      : derived.ceilingUsd;
  const ceilingOverride: SmokeReport["ceilingOverride"] =
    enforcedUsd === derived.ceilingUsd
      ? { applied: false }
      : {
          applied: true,
          derivedUsd: derived.ceilingUsd,
          enforcedUsd,
        };

  let spentUsd = 0;
  let callsReserved = 0;
  const perLegCalls = new Map<SmokeLegId, number>();

  let verdict: SmokeVerdict | null = null;

  for (const step of options.steps) {
    if (verdict !== null) {
      steps.push(notRun(step, "an earlier step failed or was aborted"));
      continue;
    }

    // ── Pre-dispatch ceiling check, per reserved leg, in declaration order.
    // Reservations collected within this step accumulate into the projection:
    // a step reserving three legs is three calls against the ceiling, not
    // three calls each measured against an empty ledger. ──
    const reservations: LegReservation[] = [];
    let projectedUsd = spentUsd;
    let projectedCalls = callsReserved;
    let abortReason: string | null = null;
    for (const leg of step.reserves) {
      const legCost = derived.legs.find((entry) => entry.leg === leg);
      if (!legCost) {
        abortReason = `leg "${leg}" has no cost model in the derived ceiling — refusing to run unbilled`;
        break;
      }
      projectedUsd += legCost.unitCostUsd;
      projectedCalls += 1;
      const legCallsUsed = perLegCalls.get(leg) ?? 0;
      if (projectedUsd > enforcedUsd + USD_EPSILON) {
        abortReason = `ceiling: dispatching the "${leg}" call would put projected spend at $${projectedUsd.toFixed(4)}, over the $${enforcedUsd.toFixed(2)} ceiling ($${spentUsd.toFixed(4)} reserved so far)`;
        break;
      }
      if (legCallsUsed + 1 > legCost.permittedCalls) {
        abortReason = `ceiling: leg "${leg}" has already used its ${String(legCost.permittedCalls)} permitted call(s)`;
        break;
      }
      if (projectedCalls > derived.ceilingCalls) {
        abortReason = `ceiling: the run's ${String(derived.ceilingCalls)} permitted calls are exhausted`;
        break;
      }
      reservations.push({ leg, unitCostUsd: legCost.unitCostUsd });
    }

    if (abortReason !== null) {
      // Abort BEFORE the call that would exceed — the step never dispatches.
      steps.push({
        step: step.id,
        label: step.label,
        status: "aborted",
        reason: abortReason,
        calls: [],
      });
      verdict = { kind: "failed", reason: abortReason };
      continue;
    }

    // ── Reserve, then execute. ──
    for (const reservation of reservations) {
      spentUsd += reservation.unitCostUsd;
      callsReserved += 1;
      perLegCalls.set(
        reservation.leg,
        (perLegCalls.get(reservation.leg) ?? 0) + 1,
      );
    }

    const reservedHere = new Set<SmokeLegId>(step.reserves);
    const stepCalls: SmokeCallRecord[] = [];
    let undeclaredSpend: string | null = null;
    const emit = (call: SmokeCallRecord): void => {
      calls.push(call);
      stepCalls.push(call);
      if (!reservedHere.has(call.leg)) {
        // Off-book spend: the ceiling never saw this call coming.
        undeclaredSpend = `step "${step.id}" emitted a call for leg "${call.leg}" it did not reserve — undeclared spend fails the run`;
      }
    };

    let execution: SmokeStepExecution;
    try {
      execution = await step.execute(emit);
    } catch (error) {
      execution = {
        status: "failed",
        reason: `step threw: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
    if (undeclaredSpend !== null) {
      execution = { status: "failed", reason: undeclaredSpend };
    }

    if (execution.status === "passed") {
      steps.push({
        step: step.id,
        label: step.label,
        status: "passed",
        calls: stepCalls,
      });
      continue;
    }
    steps.push({
      step: step.id,
      label: step.label,
      status: "failed",
      reason: execution.reason,
      calls: stepCalls,
    });
    verdict = { kind: "failed", reason: execution.reason };
  }

  return assemble({
    verdict: verdict ?? { kind: "verified" },
    ceiling: { ...derived, ceilingUsd: enforcedUsd },
    ceilingOverride,
    steps,
    calls,
    startedAtMs,
    finishedAtMs: now(),
  });
}

function notRun(step: SmokeStep, reason: string): SmokeStepOutcome {
  return {
    step: step.id,
    label: step.label,
    status: "not-run",
    reason,
    calls: [],
  };
}

interface ReportInit {
  verdict: SmokeVerdict;
  ceiling: DerivedSmokeCeiling | null;
  ceilingOverride: SmokeReport["ceilingOverride"];
  steps: readonly SmokeStepOutcome[];
  calls: readonly SmokeCallRecord[];
  startedAtMs: number;
  finishedAtMs: number;
}

function assemble(init: ReportInit): SmokeReport {
  return {
    verdict: init.verdict,
    ceiling: init.ceiling,
    ceilingOverride: init.ceilingOverride,
    steps: init.steps,
    calls: init.calls,
    startedAtMs: init.startedAtMs,
    finishedAtMs: init.finishedAtMs,
  };
}
