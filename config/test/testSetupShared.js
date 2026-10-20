/**
 * Shared preamble for every vitest setup file (server, client, integration).
 *
 * Was previously copy-pasted into all three — which meant rotating the
 * fast-check seed required editing two files while the third silently ran
 * unseeded. One owner now.
 */
import fc from "fast-check";

/**
 * The one entry point: env defaults + the fast-check seed. Every setup file
 * calls this once, so rotating the seed or adding an env default is a
 * one-file change.
 */
export function applySharedTestSetup() {
  applyTestEnvDefaults();
  fc.configureGlobal({ seed: FAST_CHECK_SEED });
}

/** Test-environment env defaults. */
export function applyTestEnvDefaults() {
  process.env.NODE_ENV = "test";
  process.env.GCS_BUCKET_NAME =
    process.env.GCS_BUCKET_NAME || "prompt-builder-test-bucket";
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
