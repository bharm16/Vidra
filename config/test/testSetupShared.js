/**
 * Shared preamble for every vitest setup file (server, client, integration).
 *
 * Was previously copy-pasted into all three — which meant rotating the
 * fast-check seed required editing two files while the third silently ran
 * unseeded. One owner now.
 */
import { vi } from "vitest";
import fc from "fast-check";

/**
 * The one entry point: env defaults + the fast-check seed, plus the fetch
 * stub where a project wants it. Every setup file calls this once, so
 * rotating the seed or adding an env default is a one-file change.
 */
export function applySharedTestSetup({ stubFetch = false } = {}) {
  applyTestEnvDefaults();
  fc.configureGlobal({ seed: FAST_CHECK_SEED });
  if (stubFetch) stubGlobalFetch();
}

/** Test-environment env defaults. */
export function applyTestEnvDefaults() {
  process.env.NODE_ENV = "test";
  process.env.GCS_BUCKET_NAME =
    process.env.GCS_BUCKET_NAME || "prompt-builder-test-bucket";
  process.env.VIDEO_GENERATE_IDEMPOTENCY_MODE =
    process.env.VIDEO_GENERATE_IDEMPOTENCY_MODE || "soft";
}

/**
 * Deterministic property-based tests. ~180 `fc.assert` call sites across the
 * repo ran unseeded, so every CI run drew fresh inputs and any latent
 * counterexample surfaced as an intermittent failure rather than a
 * reproducible one — three different property tests flaked in three
 * consecutive CI runs on 2026-08-07. A fixed seed turns the suite into a
 * reproducible regression set. Files that pass their own `seed` in fc.assert
 * options still win. Rotate this deliberately, and fix what the new seed
 * finds, rather than rediscovering counterexamples at random.
 */
export const FAST_CHECK_SEED = 20260807;

/**
 * Safe default fetch stub (Gemini-shaped) so adapter tests have stable
 * defaults. Byte-identical in the server and client setups before extraction.
 */
export function stubGlobalFetch() {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    statusText: "OK",
    json: async () => ({
      candidates: [{ content: { parts: [{ text: "stub" }] } }],
    }),
    text: async () =>
      JSON.stringify({
        candidates: [{ content: { parts: [{ text: "stub" }] } }],
      }),
  });
}
