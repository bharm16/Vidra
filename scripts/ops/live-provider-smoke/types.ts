/**
 * Shared types for the bounded live-provider smoke (issue #140).
 *
 * The smoke walks one pass of the cross-mode path against LIVE providers
 * (spec: docs/architecture/cross-mode-golden-path.md, "Bounded live-provider
 * smoke test"): one sketch frame, one studio turn, one studio edit image, one
 * first frame — no clip. Four provider legs, each with a bounded cost and a
 * bounded number of permitted calls, enforced by the runner BEFORE each call.
 *
 * The module layout follows the repo's script convention (see
 * scripts/replay/record-golden-scenarios.ts): pure logic here and in
 * ceiling.ts / preflight.ts / validate.ts / runner.ts, unit-tested under
 * `__tests__/` with fakes at the provider seam; smoke.ts is the only file
 * that boots the real app and touches the network.
 */

import type { DerivedSmokeCeiling } from "./ceiling";

/** The four provider calls the smoke is allowed to make. */
export type SmokeLegId =
  | "sketch-frame"
  | "studio-turn"
  | "studio-edit-image"
  | "first-frame";

/** Credential name (a CI secret / env var) the preflight checks. */
export interface CredentialRequirement {
  /** The primary env var / GitHub secret that must be present. */
  credential: string;
  /** Every env var that satisfies the requirement — one present value is enough. */
  alternatives: readonly string[];
  /** Which legs cannot run without it — the report names these. */
  legs: readonly SmokeLegId[];
}

/** One credential the preflight found absent (or placeholder-shaped). */
export interface MissingCredential {
  credential: string;
  legs: readonly SmokeLegId[];
}

/** The preflight verdict: what is present, and exactly what is absent. */
export interface PreflightResult {
  required: readonly CredentialRequirement[];
  missing: readonly MissingCredential[];
}

/** Outcome of one provider call (or one validation of its output). */
export interface SmokeCallRecord {
  leg: SmokeLegId;
  /** validated: output passed its shared contract + byte checks. */
  outcome: "validated" | "invalid" | "failed";
  detail?: string;
  durationMs?: number;
}

/** What one step's execute() reports back to the runner. */
export type SmokeStepExecution =
  | { status: "passed" }
  | { status: "failed"; reason: string };

/**
 * One step of the walk. A step may reserve more than one leg (the studio
 * edit turn is one HTTP turn that spends the studio-turn LLM call AND the
 * edit-image call) — the runner checks every reserved leg against the
 * ceiling BEFORE the step runs, so a step never starts if any of its calls
 * would exceed the ceiling.
 */
export interface SmokeStep {
  id: string;
  label: string;
  /** Legs charged (and ceiling-checked) before this step executes. */
  reserves: readonly SmokeLegId[];
  /**
   * Run the step. Call `emit` once per provider call with its validation
   * verdict. Emitting for a leg this step did not reserve fails the run —
   * spend that the ceiling never saw is not allowed to exist.
   */
  execute: (emit: (call: SmokeCallRecord) => void) => Promise<SmokeStepExecution>;
}

/** Per-step outcome in the report. */
export interface SmokeStepOutcome {
  step: string;
  label: string;
  status: "passed" | "failed" | "aborted" | "not-run";
  reason?: string;
  calls: readonly SmokeCallRecord[];
}

/** The run's verdict. Non-verification is NOT failure-by-another-name: it
 * says the smoke could not even ask its question (credentials or cost
 * bounds missing), which is a different signal than "a provider broke". */
export type SmokeVerdict =
  | { kind: "verified" }
  | { kind: "failed"; reason: string }
  | {
      kind: "not-verified";
      missingCredentials: readonly MissingCredential[];
      unknownBounds: readonly string[];
    };

/** The full machine-readable run report (printed and written to disk). */
export interface SmokeReport {
  verdict: SmokeVerdict;
  /** The enforced ceiling, when one could be derived. */
  ceiling: DerivedSmokeCeiling | null;
  /** Where the enforced ceiling came from, when it was lowered below derived. */
  ceilingOverride:
    | { applied: true; derivedUsd: number; enforcedUsd: number }
    | { applied: false }
    | null;
  steps: readonly SmokeStepOutcome[];
  calls: readonly SmokeCallRecord[];
  startedAtMs: number;
  finishedAtMs: number;
}

/** Exit codes the script maps verdicts to; all non-zero verdicts are red. */
export const SMOKE_EXIT_CODES = {
  verified: 0,
  failed: 1,
  notVerified: 2,
} as const;

export function verdictExitCode(verdict: SmokeVerdict): number {
  switch (verdict.kind) {
    case "verified":
      return SMOKE_EXIT_CODES.verified;
    case "failed":
      return SMOKE_EXIT_CODES.failed;
    case "not-verified":
      return SMOKE_EXIT_CODES.notVerified;
  }
}
