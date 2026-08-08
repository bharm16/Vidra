import { vi } from "vitest";
import fc from "fast-check";

// Ensure all tests run with test environment semantics.
process.env.NODE_ENV = "test";

// Deterministic property-based tests. ~180 `fc.assert` call sites across the
// repo ran unseeded, so every CI run drew fresh inputs and any latent
// counterexample surfaced as an intermittent failure rather than a
// reproducible one — three different property tests flaked in three
// consecutive CI runs on 2026-08-07. A fixed seed turns the suite into a
// reproducible regression set. Files that pass their own `seed` in fc.assert
// options still win. Rotate this deliberately, and fix what the new seed
// finds, rather than rediscovering counterexamples at random.
fc.configureGlobal({ seed: 20260807 });

process.env.GCS_BUCKET_NAME =
  process.env.GCS_BUCKET_NAME || "prompt-builder-test-bucket";
process.env.VIDEO_GENERATE_IDEMPOTENCY_MODE =
  process.env.VIDEO_GENERATE_IDEMPOTENCY_MODE || "soft";

// Provide a safe default fetch mock so adapter tests have stable defaults.
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
