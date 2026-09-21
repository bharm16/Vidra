#!/usr/bin/env tsx
/**
 * Record the cross-mode walkthrough pack for replay mode (issue #139).
 *
 * Boots the real app through the cross-mode harness with REPLAY_MODE=record —
 * the provider seams (aiService, studio image runner, sketch relay upstream)
 * call the LIVE providers and capture every response — and drives the
 * walkthrough's canonical scenario inputs from goldenScenarios.ts, so the
 * recorded requests are byte-identical to what the replay integration suite
 * produces. Each capture is contract-validated against the live shared
 * contracts before it can enter the cassette, carries capture provenance
 * (the effective operation, provider, model, parameters and capture run), and
 * the run is gated by a live-call budget and the walkthrough's behavior
 * invariants. Deliberate failure cases already in the pack are carried over
 * only when labelled synthetic.
 *
 * Stated spend: the pack costs one sketch frame (fal), 4-8 studio_turn LLM
 * calls, and 6 studio image runs — the clip leg is a controlled provider and
 * spends nothing. The run counts its captured responses and ABORTS past the
 * budget (default 20, `--max-live-calls` to change); a run that would exceed
 * the ceiling fails rather than trimming itself.
 *
 * Usage (from the repo root — required env is asserted below):
 *
 *   REPLAY_MODE=record NODE_ENV=test \
 *   OPENAI_API_KEY=… REPLICATE_API_TOKEN=… FAL_KEY=… \
 *   npx tsx --tsconfig tsconfig.json scripts/replay/record-cross-mode.ts
 *
 * The studio turn's provider/model is whatever the code's overridable
 * configuration resolves at capture time (STUDIO_TURN_PROVIDER /
 * STUDIO_TURN_MODEL) — the key assertion below follows it, and the recorded
 * provenance names what actually ran. Nothing is hard-coded here.
 */

import "dotenv/config";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  BudgetedCassetteStore,
  DEFAULT_MAX_LIVE_CALLS,
  recordCrossModePack,
} from "./crossModeRecorder.ts";
import { ModelConfig } from "@config/modelConfig";

function assertEnv(name: string, expected?: string): void {
  const actual = process.env[name];
  if (!actual || (expected && actual !== expected)) {
    console.error(
      `FATAL: ${name} must be set${expected ? ` to "${expected}"` : ""} (got "${actual ?? ""}"). ` +
        `See the usage block at the top of this script.`,
    );
    process.exit(2);
  }
}

/** Each LLM client id and the env var that funds it. */
const CLIENT_KEY_ENV: Record<string, string> = {
  openai: "OPENAI_API_KEY",
  groq: "GROQ_API_KEY",
  qwen: "GROQ_API_KEY",
  gemini: "GEMINI_API_KEY",
};

assertEnv("REPLAY_MODE", "record");
assertEnv("NODE_ENV", "test");
assertEnv("FAL_KEY");
assertEnv("REPLICATE_API_TOKEN");
const studioTurnProvider = ModelConfig.studio_turn.client;
const studioTurnKeyEnv = CLIENT_KEY_ENV[studioTurnProvider];
if (!studioTurnKeyEnv) {
  console.error(
    `FATAL: no known credential env var for STUDIO_TURN_PROVIDER "${studioTurnProvider}". ` +
      `Extend CLIENT_KEY_ENV in this script if the provider is real.`,
  );
  process.exit(2);
}
assertEnv(studioTurnKeyEnv);

function parseMaxLiveCalls(): number {
  const flagIndex = process.argv.indexOf("--max-live-calls");
  if (flagIndex === -1) return DEFAULT_MAX_LIVE_CALLS;
  const raw = process.argv[flagIndex + 1];
  const parsed = Number.parseInt(raw ?? "", 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    console.error(
      `FATAL: --max-live-calls must be a positive integer (got "${raw ?? ""}").`,
    );
    process.exit(2);
  }
  return parsed;
}

const maxLiveCalls = parseMaxLiveCalls();

console.log(
  `Stated spend: at most ${maxLiveCalls} live provider responses ` +
    `(default budget ${DEFAULT_MAX_LIVE_CALLS}; the canonical pack needs ` +
    `11-15) — 1 sketch frame, 4-8 studio_turn calls, 6 studio image runs. ` +
    `The run aborts past the budget rather than trimming itself.`,
);
console.log(
  `Effective studio_turn route (read from the live ModelConfig, not a doc): ` +
    `${studioTurnProvider} / ${ModelConfig.studio_turn.model}`,
);

const { startCrossModeHarness, CROSS_MODE_USER_ID } = await import(
  "../../tests/integration/helpers/cross-mode/harness.ts"
);

const fixturesDir = resolve(
  join(
    dirname(fileURLToPath(import.meta.url)),
    "../../server/src/replay/fixtures",
  ),
);

const store = new BudgetedCassetteStore(maxLiveCalls);
const harness = await startCrossModeHarness({
  replayMode: "record",
  store,
});

let exitCode = 0;
try {
  const outcome = await recordCrossModePack({
    harness,
    store,
    fixturesDir,
    userId: CROSS_MODE_USER_ID,
    log: (message) => console.log(message),
  });

  console.log(`\nPack written (${outcome.capturedCount} live captures):`);
  for (const path of outcome.written) {
    console.log(`  ${path}`);
  }
  if (outcome.carriedSyntheticCount > 0) {
    console.log(
      `Carried ${outcome.carriedSyntheticCount} labelled-synthetic failure-case ` +
        `entry(ies) from the previous pack.`,
    );
  }
  if (outcome.droppedStaleCount > 0) {
    console.log(
      `Dropped ${outcome.droppedStaleCount} stale unlabelled entry(ies) — see ` +
        `the log above; re-record them or label them synthetic.`,
    );
  }
  console.log(
    `Egress went to: ${outcome.egressHosts.join(", ") || "(nowhere)"}.`,
  );
  for (const destination of outcome.egressDestinations) {
    console.log(`  → ${destination}`);
  }
} catch (error) {
  exitCode = 1;
  console.error(
    `\nRecording FAILED — nothing was flushed:`,
    error instanceof Error ? error.message : error,
  );
} finally {
  await harness.close();
}
process.exit(exitCode);
