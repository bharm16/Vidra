/**
 * Smoke test for the recommendation snapshot eval runner.
 *
 * Verifies the harness can:
 *  - Load a tiny synthetic prompt set
 *  - Execute the production ModelIntelligenceService end-to-end with mocked
 *    spans (no live LLM calls)
 *  - Produce a snapshot with the documented shape
 *
 * This is a smoke test, not a behavioral test. The recommender's behavior is
 * already covered by the unit tests under
 * server/src/services/model-intelligence/__tests__/. Here we only assert that
 * the eval harness itself runs end-to-end and emits the snapshot fields the
 * gate compares.
 */

import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { runEval } from "@scripts/evaluation/recommendation-eval";

describe("recommendation-eval runner", () => {
  let tmpDir: string;
  let promptsPath: string;

  beforeAll(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "recommendation-eval-"));
    promptsPath = join(tmpDir, "prompts.json");
    writeFileSync(
      promptsPath,
      JSON.stringify({
        version: "test-1",
        prompts: [
          {
            id: "smoke-with-spans",
            prompt:
              "A robot walks through heavy rain in a neon city, dramatic cinematic lighting.",
            mode: "t2v",
            durationSeconds: 8,
            mockSpans: [
              { text: "robot", role: "subject.identity" },
              { text: "heavy rain", role: "environment.weather.rain" },
              { text: "neon city", role: "environment.urban" },
              {
                text: "dramatic cinematic lighting",
                role: "lighting.cinematic",
              },
            ],
          },
          {
            id: "smoke-no-spans",
            prompt: "A peaceful empty room.",
            mode: "t2v",
            durationSeconds: 4,
            mockSpans: [],
          },
        ],
      }),
      "utf8",
    );
  });

  afterAll(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("produces snapshots for every prompt in the set", async () => {
    const snapshots = await runEval({ promptsPath });
    expect(Object.keys(snapshots).sort()).toEqual([
      "smoke-no-spans",
      "smoke-with-spans",
    ]);
  });

  it("captures the documented snapshot shape per prompt", async () => {
    const snapshots = await runEval({ promptsPath });
    const snap = snapshots["smoke-with-spans"];
    expect(snap).toBeDefined();
    if (!snap) return;

    // Recommendation fields
    expect(typeof snap.recommendedModelId).toBe("string");
    expect(["high", "medium", "low"]).toContain(snap.recommendedConfidence);
    expect(Array.isArray(snap.topRecommendations)).toBe(true);
    expect(snap.topRecommendations.length).toBeGreaterThan(0);
    expect(snap.topRecommendations.length).toBeLessThanOrEqual(3);
    for (const rec of snap.topRecommendations) {
      expect(typeof rec.modelId).toBe("string");
      expect(typeof rec.overallScore).toBe("number");
    }
    expect(typeof snap.suggestComparison).toBe("boolean");

    // Requirement projections. This offline harness derives requirements with
    // the deterministic role-only fallback (no live LLM — see runEval), so only
    // role-supported flags carry specific values. hasParticleSystems is derived
    // from the environment.weather.rain span; the text-level flags (fluid
    // dynamics, dramatic lighting) are only shape-checked here, since correct
    // perception of those is covered by the live `eval:requirements`.
    expect(snap.requirements.hasParticleSystems).toBe(true);
    expect(typeof snap.requirements.hasFluidDynamics).toBe("boolean");
    expect(["natural", "stylized", "dramatic", "mixed"]).toContain(
      snap.requirements.lightingRequirements,
    );
  });

  it("produces deterministic snapshots across runs", async () => {
    const first = await runEval({ promptsPath });
    const second = await runEval({ promptsPath });
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });
});
