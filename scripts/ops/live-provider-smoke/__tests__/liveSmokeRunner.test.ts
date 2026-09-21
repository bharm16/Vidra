import { describe, expect, it } from "vitest";
import { deriveSmokeCeiling, type SmokeCeilingInputs } from "../ceiling";
import { runSmoke } from "../runner";
import { verdictExitCode, type SmokeStep } from "../types";
import { calculateLLMCost } from "../../../../server/src/config/llmCosts";

/**
 * The smoke's orchestrator, driven with FAKES at the provider seam (issue
 * #140's acceptance criteria are proved here, offline):
 *
 *   - with credentials present, the four calls run within the ceiling and
 *     validate outputs;
 *   - the run aborts on the FIRST call that would exceed the ceiling (tested
 *     with a lowered ceiling), and never trims itself into a pass;
 *   - a missing credential or unknown cost bound is an explicit
 *     non-verification — nothing runs, and the report names what is absent.
 */

/** The production-shaped ceiling inputs (see the ceiling test for the math). */
function productionInputs(): SmokeCeilingInputs {
  return {
    sketchFrameCostMillicents: 300,
    studioTurn: {
      model: "gpt-5.6-luna",
      maxOutputTokens: 8000,
      policyAttempts: 2,
      inputTokenBound: 12_000,
    },
    studioEdit: {
      slug: "nano-banana-2",
      costCentsPerCall: 7,
      costVerified: true,
    },
    firstFrameProviderIds: ["replicate-flux-schnell"],
    safetyFactor: 1.5,
  };
}

function okCeiling() {
  return deriveSmokeCeiling(productionInputs(), calculateLLMCost);
}

function okPreflight() {
  return { missing: [] as { credential: string; legs: never[] }[] };
}

/** A pass-through step that records it ran, and optionally emits a call. */
function passingStep(
  id: string,
  reserves: readonly SmokeStep["reserves"][number][],
  emitted: SmokeStep["reserves"][number][] = [],
  log: string[] = [],
): SmokeStep {
  return {
    id,
    label: id,
    reserves,
    execute: async (emit) => {
      log.push(id);
      for (const leg of emitted) {
        emit({ leg, outcome: "validated", detail: "fake provider answered" });
      }
      return { status: "passed" };
    },
  };
}

/** The live walk's step shape: each reserves exactly the legs it spends. */
function productionWalk(log: string[]): SmokeStep[] {
  return [
    passingStep("sketch-frame", ["sketch-frame"], ["sketch-frame"], log),
    passingStep("accept-and-bridge", [], [], log),
    passingStep(
      "studio-edit-turn",
      ["studio-turn", "studio-edit-image"],
      ["studio-turn", "studio-edit-image"],
      log,
    ),
    passingStep("first-frame", ["first-frame"], ["first-frame"], log),
  ];
}

describe("smoke runner: the verified path", () => {
  it("runs every step within the derived ceiling and reports verified", async () => {
    const log: string[] = [];
    const report = await runSmoke({
      preflight: okPreflight(),
      ceiling: okCeiling(),
      steps: productionWalk(log),
    });

    expect(report.verdict).toEqual({ kind: "verified" });
    expect(verdictExitCode(report.verdict)).toBe(0);
    expect(log).toEqual([
      "sketch-frame",
      "accept-and-bridge",
      "studio-edit-turn",
      "first-frame",
    ]);
    expect(report.calls.map((call) => call.leg)).toEqual([
      "sketch-frame",
      "studio-turn",
      "studio-edit-image",
      "first-frame",
    ]);
    expect(report.steps.map((step) => step.status)).toEqual([
      "passed",
      "passed",
      "passed",
      "passed",
    ]);
    // The enforced ceiling is the derived one.
    expect(report.ceiling?.ceilingUsd).toBe(0.21);
    expect(report.ceilingOverride).toEqual({ applied: false });
  });

  it("an override may only LOWER the ceiling; raising is ignored", async () => {
    const log: string[] = [];
    const report = await runSmoke({
      preflight: okPreflight(),
      ceiling: okCeiling(),
      steps: productionWalk(log),
      enforcedCeilingUsd: 5, // above derived — ignored
    });
    expect(report.ceilingOverride).toEqual({ applied: false });
    expect(report.ceiling?.ceilingUsd).toBe(0.21);

    const lowered: string[] = [];
    const aborted = await runSmoke({
      preflight: okPreflight(),
      ceiling: okCeiling(),
      steps: productionWalk(lowered),
      enforcedCeilingUsd: 0.1, // below the walk's $0.139 of bounded spend
    });
    expect(aborted.ceilingOverride).toEqual({
      applied: true,
      derivedUsd: 0.21,
      enforcedUsd: 0.1,
    });
    expect(aborted.verdict.kind).toBe("failed");
  });
});

describe("smoke runner: abort on the first call that would exceed the ceiling", () => {
  it("aborts BEFORE dispatching the step whose reservation would cross the ceiling, and never passes", async () => {
    const log: string[] = [];
    const report = await runSmoke({
      preflight: okPreflight(),
      ceiling: okCeiling(),
      steps: productionWalk(log),
      // Derived is $0.21; the walk's bounded spend reaches $0.129 by the end
      // of the studio edit step (0.003 + 0.056 + 0.07). $0.10 admits the
      // sketch frame and the studio turn but aborts at the edit image.
      enforcedCeilingUsd: 0.1,
    });

    expect(log).toEqual(["sketch-frame", "accept-and-bridge"]);
    expect(report.verdict.kind).toBe("failed");
    expect(verdictExitCode(report.verdict)).toBe(1);

    const editStep = report.steps.find((step) => step.step === "studio-edit-turn");
    expect(editStep?.status).toBe("aborted");
    expect(editStep?.reason).toContain("ceiling");
    expect(editStep?.reason).toContain("studio-edit-image");
    expect(editStep?.calls).toEqual([]);

    expect(
      report.steps.find((step) => step.step === "first-frame")?.status,
    ).toBe("not-run");
  });

  it("a step is not entered when ANY of its reserved legs would exceed, even if a sibling leg fits", async () => {
    const ran: string[] = [];
    const report = await runSmoke({
      preflight: okPreflight(),
      ceiling: okCeiling(),
      steps: [
        passingStep("sketch-frame", ["sketch-frame"], ["sketch-frame"], ran),
        // The studio turn fits under $0.10 after the sketch frame; the edit
        // image does not. The step must not start half-covered.
        passingStep(
          "studio-edit-turn",
          ["studio-turn", "studio-edit-image"],
          ["studio-turn", "studio-edit-image"],
          ran,
        ),
      ],
      enforcedCeilingUsd: 0.06,
    });

    expect(ran).toEqual(["sketch-frame"]);
    expect(report.steps[1]?.status).toBe("aborted");
  });

  it("the request ceiling is enforced too: a third studio-turn ask aborts", async () => {
    const ran: string[] = [];
    const report = await runSmoke({
      preflight: okPreflight(),
      ceiling: okCeiling(),
      steps: [
        passingStep("turn-attempt-1", ["studio-turn"], ["studio-turn"], ran),
        passingStep("turn-attempt-2", ["studio-turn"], ["studio-turn"], ran),
        passingStep("turn-attempt-3", ["studio-turn"], ["studio-turn"], ran),
      ],
    });

    // Two asks are what the policy permits; the third is refused pre-dispatch.
    expect(ran).toEqual(["turn-attempt-1", "turn-attempt-2"]);
    expect(report.steps[2]?.status).toBe("aborted");
    expect(report.steps[2]?.reason).toContain("permitted call");
    expect(report.verdict.kind).toBe("failed");
  });

  it("aborted spend still counts: an aborted run cannot be retried past the ceiling", async () => {
    const report = await runSmoke({
      preflight: okPreflight(),
      ceiling: okCeiling(),
      steps: [
        passingStep("sketch-frame", ["sketch-frame"], ["sketch-frame"]),
        {
          id: "over-ceiling",
          label: "would exceed",
          reserves: ["studio-turn", "studio-edit-image", "first-frame"],
          execute: async () => ({ status: "passed" }),
        },
      ],
      enforcedCeilingUsd: 0.1,
    });

    expect(report.verdict.kind).toBe("failed");
    expect(
      report.steps.find((step) => step.step === "over-ceiling")?.status,
    ).toBe("aborted");
    // The sketch frame's $0.003 is already on the ledger; reservations
    // accumulate within the step, so the projection crosses at the EDIT
    // IMAGE ($0.003 + $0.028 + $0.07 = $0.101 > $0.10) — the first leg that
    // would exceed, exactly as the issue demands.
    expect(report.steps.find((step) => step.step === "over-ceiling")?.reason).toContain(
      "studio-edit-image",
    );
  });
});

describe("smoke runner: non-verification is not a pass", () => {
  const stepsNeverRan = (log: string[]): SmokeStep[] => productionWalk(log);

  it("a missing credential runs NOTHING and names the credential and its legs", async () => {
    const log: string[] = [];
    const report = await runSmoke({
      preflight: {
        missing: [
          {
            credential: "REPLICATE_API_TOKEN",
            legs: ["studio-edit-image", "first-frame"],
          },
        ],
      },
      ceiling: okCeiling(),
      steps: stepsNeverRan(log),
    });

    expect(log).toEqual([]);
    expect(report.verdict).toEqual({
      kind: "not-verified",
      missingCredentials: [
        {
          credential: "REPLICATE_API_TOKEN",
          legs: ["studio-edit-image", "first-frame"],
        },
      ],
      unknownBounds: [],
    });
    expect(verdictExitCode(report.verdict)).toBe(2);
    expect(report.steps.every((step) => step.status === "not-run")).toBe(true);
  });

  it("unknown cost bounds run NOTHING and name the unbounded leg", async () => {
    const log: string[] = [];
    const report = await runSmoke({
      preflight: okPreflight(),
      ceiling: deriveSmokeCeiling(
        { ...productionInputs(), studioEdit: null },
        calculateLLMCost,
      ),
      steps: stepsNeverRan(log),
    });

    expect(log).toEqual([]);
    expect(report.verdict.kind).toBe("not-verified");
    if (report.verdict.kind !== "not-verified") return;
    expect(report.verdict.unknownBounds[0]).toContain("no edit-capable model");
    expect(report.ceiling).toBeNull();
  });

  it("missing credentials AND unknown bounds are reported together", async () => {
    const report = await runSmoke({
      preflight: { missing: [{ credential: "FAL_KEY", legs: ["sketch-frame"] }] },
      ceiling: deriveSmokeCeiling(
        { ...productionInputs(), studioEdit: null },
        calculateLLMCost,
      ),
      steps: [],
    });

    expect(report.verdict.kind).toBe("not-verified");
    if (report.verdict.kind !== "not-verified") return;
    expect(report.verdict.missingCredentials).toHaveLength(1);
    expect(report.verdict.unknownBounds).toHaveLength(1);
  });
});

describe("smoke runner: validation failure reporting", () => {
  it("a step whose output fails validation fails the run; later steps do not run", async () => {
    const log: string[] = [];
    const report = await runSmoke({
      preflight: okPreflight(),
      ceiling: okCeiling(),
      steps: [
        passingStep("sketch-frame", ["sketch-frame"], ["sketch-frame"], log),
        {
          id: "studio-edit-turn",
          label: "edit turn",
          reserves: ["studio-turn", "studio-edit-image"],
          execute: async (emit) => {
            log.push("studio-edit-turn");
            emit({
              leg: "studio-turn",
              outcome: "invalid",
              detail: "decision action=clarify, not the edit the smoke drove",
            });
            return {
              status: "failed",
              reason: "studio turn decision was clarify, not edit",
            };
          },
        },
        passingStep("first-frame", ["first-frame"], ["first-frame"], log),
      ],
    });

    expect(log).toEqual(["sketch-frame", "studio-edit-turn"]);
    expect(report.verdict).toEqual({
      kind: "failed",
      reason: "studio turn decision was clarify, not edit",
    });
    expect(verdictExitCode(report.verdict)).toBe(1);
    const failed = report.steps.find((step) => step.step === "studio-edit-turn");
    expect(failed?.calls[0]?.outcome).toBe("invalid");
    expect(
      report.steps.find((step) => step.step === "first-frame")?.status,
    ).toBe("not-run");
  });

  it("a step that throws fails with its error, and the failure is not silent", async () => {
    const report = await runSmoke({
      preflight: okPreflight(),
      ceiling: okCeiling(),
      steps: [
        {
          id: "exploding",
          label: "throws",
          reserves: [],
          execute: async () => {
            throw new Error("socket hung up");
          },
        },
      ],
    });

    expect(report.verdict).toEqual({
      kind: "failed",
      reason: "step threw: socket hung up",
    });
  });

  it("off-book spend fails the run: a call the ceiling never reserved cannot exist", async () => {
    const report = await runSmoke({
      preflight: okPreflight(),
      ceiling: okCeiling(),
      steps: [
        {
          id: "smuggler",
          label: "reserves nothing, spends anyway",
          reserves: [],
          execute: async (emit) => {
            emit({
              leg: "first-frame",
              outcome: "validated",
              detail: "undeclared",
            });
            return { status: "passed" };
          },
        },
      ],
    });

    expect(report.verdict.kind).toBe("failed");
    if (report.verdict.kind !== "failed") return;
    expect(report.verdict.reason).toContain("did not reserve");
  });
});
